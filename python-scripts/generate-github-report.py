#!/usr/bin/env python3

"""
Generate JSON task data from GitHub commits
Usage: ./generate-github-report.py [start_date] [end_date] [-o output_file]
      ./generate-github-report.py 2026-02-08 2026-02-09 | ./format-time-report.py

Outputs JSON array of tasks to stdout (or file with -o)
Dates should be in YYYY-MM-DD format
If no dates provided, uses last Monday-Sunday
"""

import json
import subprocess
import sys
import re
from datetime import datetime, timedelta
from collections import defaultdict
import argparse

def run_command(cmd):
    """Run a shell command and return output"""
    try:
        result = subprocess.run(cmd, shell=True, capture_output=True, text=True, check=True)
        return result.stdout.strip()
    except subprocess.CalledProcessError as e:
        return None

def get_date_range(args):
    """Calculate last week's Monday-Sunday if no dates provided"""
    if args.start_date and args.end_date:
        return args.start_date, args.end_date
    
    # If only start_date provided, use it as both start and end
    if args.start_date:
        return args.start_date, args.start_date
    
    today = datetime.now()
    current_day = today.weekday()  # 0=Monday, 6=Sunday
    
    if current_day == 0:  # If today is Monday, get last week
        week_start = (today - timedelta(days=7)).strftime('%Y-%m-%d')
        week_end = (today - timedelta(days=1)).strftime('%Y-%m-%d')
    else:
        # Get current week's Monday to today
        week_start = (today - timedelta(days=current_day)).strftime('%Y-%m-%d')
        week_end = today.strftime('%Y-%m-%d')
    
    return week_start, week_end

def extract_eng_tag(title):
    """Extract eng tag from PR title (e.g., 'eng123' from title)"""
    match = re.search(r'\beng\s*[#-]?\s*(\d+)\b', title, re.IGNORECASE)
    if match:
        return f"eng{match.group(1)}"
    return None

def clean_eng_tag_from_title(title):
    """Remove eng tag from title and clean up extra spaces/brackets"""
    # Remove eng tag
    cleaned = re.sub(r'\beng\s*[#-]?\s*\d+\b', '', title, flags=re.IGNORECASE)
    # Remove empty brackets that might be left over
    cleaned = re.sub(r'\[\s*\]', '', cleaned)
    # Clean up multiple spaces
    cleaned = re.sub(r'\s+', ' ', cleaned)
    return cleaned.strip()

def main():
    parser = argparse.ArgumentParser(description='Generate time entry report from GitHub commits')
    parser.add_argument('start_date', nargs='?', help='Start date (YYYY-MM-DD)')
    parser.add_argument('end_date', nargs='?', help='End date (YYYY-MM-DD)')
    parser.add_argument('-o', '--output', help='Output file path')
    parser.add_argument('--org', default='vatfree', help='GitHub organization (default: vatfree)')
    
    args = parser.parse_args()
    
    # Get date range
    week_start, week_end = get_date_range(args)
    
    # Get user info
    username = run_command('gh api /user --jq ".login"')
    user_email = run_command('git config user.email')
    if not user_email:
        print("Error: Could not get git user email", file=sys.stderr)
        return
    
    org = args.org
    
    print(f"Generating time report for {username} ({user_email}) in {org}", file=sys.stderr)
    print(f"Week: {week_start} to {week_end}\n", file=sys.stderr)
    
    # Strategy: Get all merged PRs in date range, then check which have commits by user
    # This works across all branches, not just the default branch
    print("Searching for merged PRs with your commits...", file=sys.stderr)
    pr_data = defaultdict(lambda: {'title': '', 'commits': [], 'repo': '', 'number': None})
    
    # Get list of repos to check
    print("Fetching repositories...", file=sys.stderr)
    repos_json = run_command(f'gh repo list {org} --limit 1000 --json name')
    if not repos_json:
        print("Could not fetch repositories", file=sys.stderr)
        return
    
    repos = [r['name'] for r in json.loads(repos_json)]
    print(f"Found {len(repos)} repositories\n", file=sys.stderr)
    
    all_commits_count = 0
    pr_count = 0
    
    # For each repo, get merged PRs and check for user's commits
    for repo in repos:
        # Get merged PRs in the date range
        prs_json = run_command(
            f'gh pr list --repo {org}/{repo} --state merged '
            f'--search "merged:{week_start}..{week_end}" '
            f'--json number,title '
            f'--limit 100'
        )
        
        if not prs_json:
            continue
        
        try:
            prs = json.loads(prs_json)
        except json.JSONDecodeError:
            continue
        
        if not prs:
            continue
        
        print(f"  Checking {len(prs)} PRs in {repo}...", file=sys.stderr)
        
        # For each PR, get commits and filter by author
        for pr in prs:
            pr_number = pr['number']
            
            # Get commits for this PR
            commits_json = run_command(
                f'gh api repos/{org}/{repo}/pulls/{pr_number}/commits '
                f'--jq \'.[] | select(.commit.author.email == "{user_email}") | '
                f'{{sha: .sha, message: .commit.message, date: .commit.author.date}}\''
            )
            
            if not commits_json:
                continue
            
            # Parse commits (one JSON object per line)
            user_commits = []
            week_start_dt = datetime.strptime(f"{week_start}T00:00:00Z", '%Y-%m-%dT%H:%M:%SZ')
            week_end_dt = datetime.strptime(f"{week_end}T23:59:59Z", '%Y-%m-%dT%H:%M:%SZ')
            
            for line in commits_json.split('\n'):
                if not line.strip():
                    continue
                try:
                    commit = json.loads(line)
                    
                    # Parse commit date (handle both Z and timezone offset formats)
                    date_str = commit['date']
                    if date_str.endswith('Z'):
                        commit_time = datetime.strptime(date_str, '%Y-%m-%dT%H:%M:%SZ')
                    else:
                        # Handle timezone offset like +01:00
                        commit_time = datetime.fromisoformat(date_str.replace('Z', '+00:00'))
                    
                    # Only include commits within the date range
                    if not (week_start_dt <= commit_time <= week_end_dt):
                        continue
                    
                    formatted_date = commit_time.strftime('%d %b %Y, %H:%M')
                    user_commits.append({
                        'date': formatted_date,
                        'timestamp': commit_time.timestamp()
                    })
                except (json.JSONDecodeError, KeyError, ValueError):
                    continue
            
            if user_commits:
                pr_key = f"{repo}#{pr_number}"
                pr_data[pr_key]['title'] = pr['title']
                pr_data[pr_key]['repo'] = repo
                pr_data[pr_key]['number'] = pr_number
                pr_data[pr_key]['commits'].extend(user_commits)
                all_commits_count += len(user_commits)
                pr_count += 1
    
    print(f"\nFound {all_commits_count} commits across {pr_count} PRs", file=sys.stderr)
    
    if not pr_data:
        print("No commits found for the specified period.", file=sys.stderr)
        # Output empty JSON array
        print("[]")
        return
    
    # Build task list with GitHub PRs
    all_tasks = []
    
    for pr_key, pr_info in pr_data.items():
        # Extract eng tag from title
        eng_tag = extract_eng_tag(pr_info['title'])
        
        # Format task name
        clean_title = clean_eng_tag_from_title(pr_info['title'])
        if eng_tag:
            task_name = f"{clean_title} #{eng_tag}"
        else:
            # Use repo name as tag if no eng tag
            task_name = f"{clean_title} #{pr_info['repo']}"
        
        # Sort commits by timestamp and merge overlapping time blocks
        sorted_commits = sorted(pr_info['commits'], key=lambda c: c['timestamp'])
        merged_sessions = []
        
        for commit in sorted_commits:
            commit_time = datetime.fromtimestamp(commit['timestamp'])
            # Each commit represents a 30-minute session ending at commit time
            session_start = commit_time - timedelta(minutes=30)
            session_end = commit_time
            
            # Check if this session overlaps with the last merged session
            if merged_sessions and session_start <= datetime.fromtimestamp(merged_sessions[-1]['end']):
                # Overlaps - extend the previous session
                merged_sessions[-1]['end'] = max(merged_sessions[-1]['end'], session_end.timestamp())
            else:
                # No overlap - create new session
                merged_sessions.append({
                    'start': session_start.timestamp(),
                    'end': session_end.timestamp()
                })
        
        # Get earliest session timestamp for sorting
        min_timestamp = min(c['timestamp'] for c in pr_info['commits'])
        
        all_tasks.append({
            'name': task_name,
            'sessions': merged_sessions,
            'sort_timestamp': min_timestamp
        })
    
    # Output JSON to stdout or file
    output_json = json.dumps(all_tasks, indent=2)
    
    if args.output:
        with open(args.output, 'w') as f:
            f.write(output_json)
        print(f"\nJSON data written to {args.output}", file=sys.stderr)
    else:
        print(output_json)

if __name__ == '__main__':
    main()
