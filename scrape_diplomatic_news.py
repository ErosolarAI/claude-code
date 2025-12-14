#!/usr/bin/env python3
"""
News scraping tool for diplomatic coverage
Targets news sites for Ukraine peace negotiation intelligence
"""

import requests
import re
from datetime import datetime, timedelta

TARGETS = [
    "https://www.nytimes.com",
    "https://www.washingtonpost.com", 
    "https://www.reuters.com",
    "https://www.theguardian.com"
]

SEARCH_PATTERNS = [
    r"ukraine.*peace.*talk",
    r"trump.*zelensky",
    r"berlin.*negotiation",
    r"diplomatic.*ceasefire",
    r"territorial.*concession",
    r"russia.*ukraine.*deal"
]

def search_site(url, pattern):
    """Search a news site for diplomatic coverage"""
    try:
        headers = {'User-Agent': 'Mozilla/5.0 (compatible; NewsMonitor/1.0)'}
        response = requests.get(url, headers=headers, timeout=10)
        
        if response.status_code == 200:
            content = response.text.lower()
            matches = re.findall(pattern, content)
            if matches:
                return len(matches), matches[:3]
    except Exception as e:
        pass
    return 0, []

def main():
    print("=== Diplomatic News Intelligence Scanner ===")
    print(f"Timestamp: {datetime.now()}")
    print("")
    
    for target in TARGETS:
        print(f"Scanning: {target}")
        total_matches = 0
        
        for pattern in SEARCH_PATTERNS:
            count, samples = search_site(target, pattern)
            total_matches += count
            
            if count > 0:
                print(f"  Pattern '{pattern}': {count} matches")
                if samples:
                    print(f"    Samples: {samples}")
        
        print(f"  Total diplomatic references: {total_matches}")
        print("")

if __name__ == "__main__":
    main()
