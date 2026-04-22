#!/usr/bin/env python3

"""
Generate JSON task data from Slack huddles
Usage: ./generate-slack-report.py [start_date] [end_date] [-o output_file]
      ./generate-slack-report.py 2026-02-08 2026-02-09 | ./format-time-report.py

Outputs JSON array of tasks to stdout (or file with -o)
Dates should be in YYYY-MM-DD format
If no dates provided, uses last Monday-Sunday

Loads huddles from slack_huddles.json file (generated via bookmarklet)
All huddles are labeled as "Slack huddle #meetings"

Environment variables:
  SLACK_USER_ID        - Your Slack user ID (e.g., U03H3A69E2D) [required]
  SLACK_HUDDLES_PATH   - Directory containing slack_huddles.json (default: ~/Downloads)

CLI arguments (override env vars):
  --slack-user-id      - Your Slack user ID
  --slack-huddles-path - Path to directory with slack_huddles.json

To generate slack_huddles.json:
1. Open Slack in browser
2. Run the bookmarklet to download huddles data
3. Save as slack_huddles.json in ~/Downloads (or set SLACK_HUDDLES_PATH)
"""

import json
import sys
import os
from datetime import datetime, timedelta
import argparse
import glob

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

def manage_huddles_backup(huddles_path, use_backup=False):
    """
    Manage backup files for slack_huddles.json:
    1. If slack_huddles.json exists:
       - Remove slack_huddles.json.bak if it exists
       - Create new .bak from current slack_huddles.json
    2. If slack_huddles.json doesn't exist but .bak does:
       - Use backup if use_backup flag is True, otherwise return None
    Returns the path to the huddles file to load, or None if not found
    """
    # Expand ~ to home directory
    huddles_path = os.path.expanduser(huddles_path)
    
    huddles_file = os.path.join(huddles_path, 'slack_huddles.json')
    backup_file = os.path.join(huddles_path, 'slack_huddles.json.bak')
    
    # Check if new slack_huddles.json exists
    if os.path.exists(huddles_file):
        # Step 1: Remove old .bak file if it exists
        if os.path.exists(backup_file):
            try:
                os.remove(backup_file)
                print(f"Removed old backup: {backup_file}", file=sys.stderr)
            except OSError as e:
                print(f"Warning: Could not remove old backup {backup_file}: {e}", file=sys.stderr)
        
        # Step 2: Create new .bak from current file
        try:
            import shutil
            shutil.copy2(huddles_file, backup_file)
            print(f"Created backup: {backup_file}", file=sys.stderr)
        except (OSError, IOError) as e:
            print(f"Warning: Could not create backup {backup_file}: {e}", file=sys.stderr)
        return huddles_file
    
    # If no new file exists but backup does, check if user wants to use it
    if os.path.exists(backup_file):
        if use_backup:
            print(f"Using backup file: {backup_file}", file=sys.stderr)
            return backup_file
        else:
            print(f"Warning: slack_huddles.json not found, but backup exists: {backup_file}", file=sys.stderr)
            print("Use --use-backup flag to use the backup file.", file=sys.stderr)
            return None
    
    # If no new file exists, leave old .bak in place
    return None

def load_slack_huddles(huddles_path, use_backup=False):
    """
    Load Slack huddles from JSON file
    Looks for slack_huddles.json in the specified directory
    """
    # Manage backups and get file path
    huddles_file = manage_huddles_backup(huddles_path, use_backup)
    
    if not huddles_file:
        huddles_path = os.path.expanduser(huddles_path)
        print(f"Error: No slack_huddles.json file found in {huddles_path}", file=sys.stderr)
        print("", file=sys.stderr)
        print("To generate this file:", file=sys.stderr)
        print("1. Open Slack in your browser", file=sys.stderr)
        print("2. Run the bookmarklet to download huddles data", file=sys.stderr)
        print("3. Save the file as slack_huddles.json", file=sys.stderr)
        return []
    
    try:
        with open(huddles_file, 'r') as f:
            data = json.load(f)
            print(f"Loaded huddles from {huddles_file}", file=sys.stderr)
            return data.get('huddles', [])
    except (json.JSONDecodeError, FileNotFoundError) as e:
        print(f"Error loading {huddles_file}: {e}", file=sys.stderr)
        return []

def filter_slack_huddles(huddles, user_id, start_date, end_date):
    """
    Filter Slack huddles by user participation and date range
    """
    # Parse date range
    start_dt = datetime.strptime(f"{start_date}T00:00:00Z", '%Y-%m-%dT%H:%M:%SZ')
    end_dt = datetime.strptime(f"{end_date}T23:59:59Z", '%Y-%m-%dT%H:%M:%SZ')
    
    filtered_huddles = []
    for huddle in huddles:
        # Check if user participated
        participant_history = huddle.get('participant_history', [])
        if user_id not in participant_history:
            continue
        
        # Check date range
        date_start = huddle.get('date_start')
        date_end = huddle.get('date_end')
        if not date_start or not date_end:
            continue
        
        huddle_start = datetime.fromtimestamp(date_start)
        huddle_end = datetime.fromtimestamp(date_end)
        
        # Include if huddle overlaps with date range
        if huddle_end < start_dt or huddle_start > end_dt:
            continue
        
        # Calculate duration in minutes
        duration_minutes = int((date_end - date_start) / 60)
        
        # Get other participants (exclude current user)
        other_participants = [p for p in participant_history if p != user_id]
        
        filtered_huddles.append({
            'id': huddle.get('id'),
            'start_time': huddle_start,
            'end_time': huddle_end,
            'duration_minutes': duration_minutes,
            'participants': other_participants,
            'timestamp': date_start
        })
    
    return filtered_huddles

def format_huddle_task_name(huddle, user_map=None):
    """Format huddle task name - all huddles use same name"""
    return "Slack huddle #meetings"

def cleanup_huddles_file(huddles_path):
    """
    Delete slack_huddles.json file after processing
    """
    huddles_path = os.path.expanduser(huddles_path)
    huddles_file = os.path.join(huddles_path, 'slack_huddles.json')
    
    if os.path.exists(huddles_file):
        try:
            os.remove(huddles_file)
            print(f"Deleted: {huddles_file}", file=sys.stderr)
        except OSError as e:
            print(f"Warning: Could not delete {huddles_file}: {e}", file=sys.stderr)

def main():
    parser = argparse.ArgumentParser(description='Generate time entry report from Slack huddles')
    parser.add_argument('start_date', nargs='?', help='Start date (YYYY-MM-DD)')
    parser.add_argument('end_date', nargs='?', help='End date (YYYY-MM-DD)')
    parser.add_argument('-o', '--output', help='Output file path')
    parser.add_argument('--slack-user-id', help='Your Slack user ID (default: $SLACK_USER_ID env var)')
    parser.add_argument('--slack-huddles-path', help='Path to slack_huddles.json directory (default: ~/Downloads)')
    parser.add_argument('--use-backup', action='store_true', help='Use slack_huddles.json.bak if main file not found')
    
    args = parser.parse_args()
    
    # Get Slack configuration from env vars if not provided via CLI
    slack_user_id = args.slack_user_id or os.environ.get('SLACK_USER_ID')
    slack_huddles_path = args.slack_huddles_path or os.environ.get('SLACK_HUDDLES_PATH', '~/Downloads')
    
    # Validate Slack user ID
    if not slack_user_id:
        print("Error: SLACK_USER_ID not set. Either set the environment variable or use --slack-user-id", file=sys.stderr)
        print("Example: export SLACK_USER_ID=U03H3A69E2D", file=sys.stderr)
        print("", file=sys.stderr)
        print("To find your user ID in Slack:", file=sys.stderr)
        print("Profile → More → Copy member ID", file=sys.stderr)
        sys.exit(1)
    
    # Get date range
    week_start, week_end = get_date_range(args)
    
    print(f"Generating Slack huddles report for user {slack_user_id}", file=sys.stderr)
    print(f"Week: {week_start} to {week_end}", file=sys.stderr)
    print("", file=sys.stderr)
    
    # Load Slack huddles from file
    slack_huddles_raw = load_slack_huddles(slack_huddles_path, args.use_backup)
    
    if not slack_huddles_raw:
        print("No huddles data loaded.", file=sys.stderr)
        # Output empty JSON array
        print("[]")
        return
    
    # Filter huddles by user and date range
    slack_huddles = filter_slack_huddles(slack_huddles_raw, slack_user_id, week_start, week_end)
    
    if not slack_huddles:
        print("No huddles found for the specified period.", file=sys.stderr)
        # Output empty JSON array
        print("[]")
        return
    
    print(f"Found {len(slack_huddles)} huddles", file=sys.stderr)
    print("", file=sys.stderr)
    
    # Build task list with Slack huddles
    all_tasks = []
    
    for huddle in slack_huddles:
        task_name = format_huddle_task_name(huddle)
        
        # Huddles are single sessions
        sessions = [{
            'start': huddle['timestamp'],
            'end': huddle['timestamp'] + (huddle['duration_minutes'] * 60)
        }]
        
        all_tasks.append({
            'name': task_name,
            'sessions': sessions,
            'sort_timestamp': huddle['timestamp']
        })
    
    # Output JSON to stdout or file
    output_json = json.dumps(all_tasks, indent=2)
    
    if args.output:
        with open(args.output, 'w') as f:
            f.write(output_json)
        print(f"JSON data written to {args.output}", file=sys.stderr)
    else:
        print(output_json)
    
    # Step 3: Delete the slack_huddles.json file after processing
    print("", file=sys.stderr)
    cleanup_huddles_file(slack_huddles_path)

if __name__ == '__main__':
    main()
