#!/usr/bin/env python3

"""
Format time entry report from JSON task data
Reads JSON from stdin or file and generates YAML time report

Input JSON format:
[
  {
    "name": "Task name #tag",
    "sessions": [
      {"start": 1234567890, "end": 1234567920}
    ],
    "sort_timestamp": 1234567890
  }
]

Usage:
  ./github-data.py | ./format-time-report.py
  ./slack-data.py | ./format-time-report.py
  cat github.json slack.json | jq -s 'add' | ./format-time-report.py
  ./format-time-report.py < tasks.json
  ./format-time-report.py tasks.json
"""

import json
import sys
from datetime import datetime
import argparse

def format_time_report(tasks):
    """Generate YAML time report from task data"""
    if not tasks:
        return None
    
    # Sort all tasks by their earliest timestamp
    tasks.sort(key=lambda t: t['sort_timestamp'])
    
    output_lines = []
    output_lines.append("# Time Entry Submission")
    output_lines.append("# Review and confirm the sessions below:")
    output_lines.append("# Save and close this file to submit, or delete all content to cancel")
    output_lines.append("")
    output_lines.append("tasks:")
    
    # Output all tasks
    for task in tasks:
        output_lines.append(f'  - taskName: "{task["name"]}"')
        output_lines.append(f'    focus:')
        
        # Output sessions
        for session in task['sessions']:
            start_time = datetime.fromtimestamp(session['start'])
            duration_minutes = int((session['end'] - session['start']) / 60)
            formatted_date = start_time.strftime('%d %b %Y, %H:%M')
            output_lines.append(f"      - {formatted_date}, {duration_minutes} min")
    
    return '\n'.join(output_lines)

def main():
    parser = argparse.ArgumentParser(description='Format time entry report from JSON task data')
    parser.add_argument('input', nargs='?', help='Input JSON file (default: stdin)')
    parser.add_argument('-o', '--output', help='Output file path (default: stdout)')
    
    args = parser.parse_args()
    
    # Read JSON input
    try:
        if args.input:
            with open(args.input, 'r') as f:
                tasks = json.load(f)
        else:
            # Read from stdin
            input_data = sys.stdin.read().strip()
            if not input_data:
                print("Error: No input data provided", file=sys.stderr)
                print("Usage: ./format-time-report.py < tasks.json", file=sys.stderr)
                print("   or: ./generate-github-report.py | ./format-time-report.py", file=sys.stderr)
                sys.exit(1)
            tasks = json.loads(input_data)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON input: {e}", file=sys.stderr)
        sys.exit(1)
    except FileNotFoundError:
        print(f"Error: File not found: {args.input}", file=sys.stderr)
        sys.exit(1)
    
    if not isinstance(tasks, list):
        print("Error: Input must be a JSON array of tasks", file=sys.stderr)
        sys.exit(1)
    
    # Generate report
    output = format_time_report(tasks)
    
    if not output:
        print("No tasks to report", file=sys.stderr)
        sys.exit(0)
    
    # Write output
    if args.output:
        with open(args.output, 'w') as f:
            f.write(output)
        print(f"Report written to {args.output}", file=sys.stderr)
    else:
        print(output)

if __name__ == '__main__':
    main()
