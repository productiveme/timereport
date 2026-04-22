#!/usr/bin/env python3

"""
Generate JSON task data from calendar events via Nylas API
Usage: ./generate-calcom-report.py [start_date] [end_date] [-o output_file]
      ./generate-calcom-report.py 2026-02-08 2026-02-09 | ./format-time-report.py

Outputs JSON array of tasks to stdout (or file with -o)
Dates should be in YYYY-MM-DD format
If no dates provided, uses last Monday-Sunday

Fetches calendar events from Nylas API (unified calendar API for Google Calendar, Outlook, etc.)
All calendar events are labeled as "Calendar Appointment #meetings"

Environment variables:
  NYLAS_API_KEY        - Your Nylas API key [required]
  NYLAS_GRANT_ID       - Your Nylas grant ID (calendar account) [required]

CLI arguments (override env vars):
  --nylas-api-key      - Your Nylas API key
  --nylas-grant-id     - Your Nylas grant ID

To get your Nylas credentials:
1. Sign up at https://dashboard.nylas.com (free for up to 5 accounts)
2. Connect your Google Calendar account to get a grant ID
3. Get your API key from the dashboard
4. Set NYLAS_API_KEY and NYLAS_GRANT_ID environment variables
"""

import json
import sys
import os
from datetime import datetime, timedelta
import argparse
import urllib.request
import urllib.error
import urllib.parse

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

def fetch_nylas_calendars(api_key, grant_id):
    """
    Fetch list of calendars from Nylas API
    Returns list of calendar objects
    """
    url = f'https://api.us.nylas.com/v3/grants/{grant_id}/calendars'
    
    headers = {
        'Accept': 'application/json',
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json'
    }
    
    try:
        request = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(request) as response:
            data = json.loads(response.read().decode('utf-8'))
            calendars = data.get('data', [])
            print(f"Found {len(calendars)} calendars", file=sys.stderr)
            return calendars
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8') if e.fp else 'No error details'
        print(f"Error fetching Nylas calendars: HTTP {e.code}", file=sys.stderr)
        print(f"Error details: {error_body}", file=sys.stderr)
        return []
    except urllib.error.URLError as e:
        print(f"Error connecting to Nylas API: {e.reason}", file=sys.stderr)
        return []
    except json.JSONDecodeError as e:
        print(f"Error parsing Nylas API response: {e}", file=sys.stderr)
        return []

def fetch_nylas_events(api_key, grant_id, calendar_id, start_date, end_date):
    """
    Fetch calendar events from Nylas API for the specified date range
    Returns list of event objects
    """
    # Parse dates to Unix timestamps
    start_dt = datetime.strptime(f"{start_date}T00:00:00", '%Y-%m-%dT%H:%M:%S')
    end_dt = datetime.strptime(f"{end_date}T23:59:59", '%Y-%m-%dT%H:%M:%S')
    
    start_timestamp = int(start_dt.timestamp())
    end_timestamp = int(end_dt.timestamp())
    
    # Build API request
    # Nylas v3 API endpoint for events
    # Reference: https://developer.nylas.com/docs/api/v3/ecc/#get-/v3/grants/-grant_id-/events
    params = urllib.parse.urlencode({
        'calendar_id': calendar_id,
        'start': start_timestamp,
        'end': end_timestamp,
        'busy': 'true',  # Only fetch events that block time (not free/transparent)
        'limit': 200  # Fetch up to 200 events (Nylas API max)
    })
    
    url = f'https://api.us.nylas.com/v3/grants/{grant_id}/events?{params}'
    
    headers = {
        'Accept': 'application/json',
        'Authorization': f'Bearer {api_key}',
        'Content-Type': 'application/json'
    }
    
    try:
        request = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(request) as response:
            data = json.loads(response.read().decode('utf-8'))
            events = data.get('data', [])
            print(f"Fetched {len(events)} events from Nylas API", file=sys.stderr)
            return events
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8') if e.fp else 'No error details'
        print(f"Error fetching Nylas events: HTTP {e.code}", file=sys.stderr)
        print(f"Error details: {error_body}", file=sys.stderr)
        if e.code == 401:
            print("", file=sys.stderr)
            print("Authentication failed. Please check:", file=sys.stderr)
            print("1. Your NYLAS_API_KEY is correct", file=sys.stderr)
            print("2. Your NYLAS_GRANT_ID is correct", file=sys.stderr)
        return []
    except urllib.error.URLError as e:
        print(f"Error connecting to Nylas API: {e.reason}", file=sys.stderr)
        return []
    except json.JSONDecodeError as e:
        print(f"Error parsing Nylas API response: {e}", file=sys.stderr)
        return []

def parse_nylas_events(events):
    """
    Parse Nylas events into standardized format
    Returns list of parsed event objects
    """
    parsed_events = []
    
    for event in events:
        # Skip events without when information
        when = event.get('when', {})
        if not when:
            continue
        
        # Get start and end times from timespan
        start_time = when.get('start_time')
        end_time = when.get('end_time')
        
        if not start_time or not end_time:
            continue
        
        # Skip events marked as transparent (free time)
        if not event.get('busy', True):
            continue
        
        # Skip cancelled events
        if event.get('status', '') == 'cancelled':
            continue
        
        # Parse Unix timestamps
        try:
            start_dt = datetime.fromtimestamp(start_time)
            end_dt = datetime.fromtimestamp(end_time)
        except (ValueError, TypeError) as e:
            print(f"Warning: Could not parse event times: {e}", file=sys.stderr)
            continue
        
        # Calculate duration in minutes
        duration_minutes = int((end_dt - start_dt).total_seconds() / 60)
        
        # Skip very short events (less than 1 minute)
        if duration_minutes < 1:
            continue
        
        # Get event details
        event_id = event.get('id', 'unknown')
        title = event.get('title', 'Calendar Appointment')
        
        parsed_events.append({
            'id': event_id,
            'title': title,
            'start_time': start_dt,
            'end_time': end_dt,
            'duration_minutes': duration_minutes,
            'timestamp': start_time
        })
    
    return parsed_events

def format_event_task_name(event):
    """
    Format event task name using the actual meeting title
    Adds #meetings hashtag at the end
    """
    title = event.get('title', 'Calendar Appointment')
    
    # Clean up the title (remove extra whitespace)
    title = ' '.join(title.split())
    
    # If title is empty or just whitespace, use default
    if not title:
        title = 'Calendar Appointment'
    
    # Add #meetings hashtag
    return f"{title} #meetings"

def main():
    parser = argparse.ArgumentParser(description='Generate time entry report from calendar via Nylas API')
    parser.add_argument('start_date', nargs='?', help='Start date (YYYY-MM-DD)')
    parser.add_argument('end_date', nargs='?', help='End date (YYYY-MM-DD)')
    parser.add_argument('-o', '--output', help='Output file path')
    parser.add_argument('--nylas-api-key', help='Your Nylas API key (default: $NYLAS_API_KEY env var)')
    parser.add_argument('--nylas-grant-id', help='Your Nylas grant ID (default: $NYLAS_GRANT_ID env var)')
    
    args = parser.parse_args()
    
    # Get Nylas credentials from env vars if not provided via CLI
    nylas_api_key = args.nylas_api_key or os.environ.get('NYLAS_API_KEY')
    nylas_grant_id = args.nylas_grant_id or os.environ.get('NYLAS_GRANT_ID')
    
    # Check if credentials are set
    if not nylas_api_key or not nylas_grant_id:
        print("Info: Nylas credentials not set. Skipping calendar events.", file=sys.stderr)
        print("", file=sys.stderr)
        print("To enable calendar integration:", file=sys.stderr)
        print("1. Sign up at https://dashboard.nylas.com (free for up to 5 accounts)", file=sys.stderr)
        print("2. Connect your Google Calendar account", file=sys.stderr)
        print("3. Get your API key and grant ID from the dashboard", file=sys.stderr)
        print("4. Set environment variables:", file=sys.stderr)
        print("   export NYLAS_API_KEY='your_api_key_here'", file=sys.stderr)
        print("   export NYLAS_GRANT_ID='your_grant_id_here'", file=sys.stderr)
        print("", file=sys.stderr)
        # Output empty JSON array
        print("[]")
        return
    
    # Get date range
    week_start, week_end = get_date_range(args)
    
    print(f"Generating calendar report via Nylas API", file=sys.stderr)
    print(f"Week: {week_start} to {week_end}", file=sys.stderr)
    print("", file=sys.stderr)
    
    # First, fetch list of calendars to get calendar_id
    calendars = fetch_nylas_calendars(nylas_api_key, nylas_grant_id)
    
    if not calendars:
        print("No calendars found in Nylas account.", file=sys.stderr)
        # Output empty JSON array
        print("[]")
        return
    
    # Use the primary calendar if available, otherwise use the first calendar
    primary_calendar = None
    for calendar in calendars:
        if calendar.get('is_primary', False):
            primary_calendar = calendar
            break
    
    if not primary_calendar:
        primary_calendar = calendars[0]
    
    calendar_id = primary_calendar.get('id')
    calendar_name = primary_calendar.get('name', 'Unknown')
    
    print(f"Using calendar: {calendar_name} (ID: {calendar_id})", file=sys.stderr)
    print("", file=sys.stderr)
    
    # Fetch events from Nylas API
    events_raw = fetch_nylas_events(nylas_api_key, nylas_grant_id, calendar_id, week_start, week_end)
    
    if not events_raw:
        print("No events retrieved from Nylas API.", file=sys.stderr)
        # Output empty JSON array
        print("[]")
        return
    
    # Parse events
    events = parse_nylas_events(events_raw)
    
    if not events:
        print("No valid calendar events found for the specified period.", file=sys.stderr)
        # Output empty JSON array
        print("[]")
        return
    
    print(f"Found {len(events)} calendar events (busy time only)", file=sys.stderr)
    print("", file=sys.stderr)
    
    # Build task list with calendar events
    all_tasks = []
    
    for event in events:
        task_name = format_event_task_name(event)
        
        # Events are single sessions
        sessions = [{
            'start': event['timestamp'],
            'end': event['timestamp'] + (event['duration_minutes'] * 60)
        }]
        
        all_tasks.append({
            'name': task_name,
            'sessions': sessions,
            'sort_timestamp': event['timestamp']
        })
    
    # Output JSON to stdout or file
    output_json = json.dumps(all_tasks, indent=2)
    
    if args.output:
        with open(args.output, 'w') as f:
            f.write(output_json)
        print(f"JSON data written to {args.output}", file=sys.stderr)
    else:
        print(output_json)

if __name__ == '__main__':
    main()
