#!/usr/bin/env python3
"""
Cloud asset discovery for Apple domains.
Checks S3 buckets, Azure blobs, Google Cloud storage for misconfigurations.
"""
import requests
import sys
import concurrent.futures
from urllib.parse import urlparse

# Common bucket permutations
BUCKET_FORMATS = [
    "{}",
    "{}-assets",
    "{}-backup",
    "{}-data",
    "{}-dev",
    "{}-staging",
    "{}-prod",
    "{}-test",
    "{}-uploads",
    "{}-media",
    "{}-static",
    "{}-cdn",
    "{}-storage",
    "assets-{}",
    "data-{}",
    "dev-{}",
    "prod-{}",
    "staging-{}",
    "{}-bucket",
    "bucket-{}",
    "{}-s3",
    "s3-{}",
    "{}-blob",
    "blob-{}",
    "{}-gcs",
    "gcs-{}",
    "{}-azure",
    "azure-{}",
]

# Cloud endpoints to check
ENDPOINTS = {
    "aws_s3": "http://{}.s3.amazonaws.com",
    "aws_s3_https": "https://{}.s3.amazonaws.com",
    "aws_s3_website": "http://{}.s3-website-us-east-1.amazonaws.com",
    "aws_s3_website_eu": "http://{}.s3-website-eu-west-1.amazonaws.com",
    "digitalocean": "https://{}.digitaloceanspaces.com",
    "google": "https://storage.googleapis.com/{}",
    "azure": "https://{}.blob.core.windows.net",
    "backblaze": "https://{}.s3.us-west-004.backblazeb2.com",
    "oracle": "https://{}.objectstorage.us-ashburn-1.oci.customer-oci.com",
    "linode": "https://{}.us-east-1.linodeobjects.com",
}

def check_endpoint(name, url):
    """Check if endpoint is accessible and returns interesting response."""
    try:
        resp = requests.head(url, timeout=5, allow_redirects=True)
        status = resp.status_code
        
        if status == 200:
            # Check for public listing
            list_resp = requests.get(url, timeout=5)
            if "ListBucketResult" in list_resp.text or "Contents" in list_resp.text:
                return (name, url, status, "PUBLIC_LISTING", list_resp.headers.get('Content-Type', ''))
            return (name, url, status, "PUBLIC_ACCESS", resp.headers.get('Content-Type', ''))
        elif status == 403:
            return (name, url, status, "PRIVATE", resp.headers.get('x-amz-error-code', ''))
        elif status == 404:
            return None
        elif status in [301, 302, 307, 308]:
            return (name, url, status, "REDIRECT", resp.headers.get('Location', ''))
        elif status in [400, 401, 500, 503]:
            return (name, url, status, "ERROR", resp.headers.get('Server', ''))
    except requests.exceptions.RequestException as e:
        return (name, url, "ERROR", str(e)[:50], "")
    return None

def generate_bucket_names(domain):
    """Generate bucket name permutations from domain."""
    domain_clean = domain.replace('.', '-').replace('_', '-').lower()
    parts = domain.split('.')
    
    names = set()
    
    # Full domain
    names.add(domain_clean)
    
    # Without TLD
    if len(parts) > 1:
        names.add('-'.join(parts[:-1]))
    
    # Subdomain variations
    for part in parts:
        if len(part) > 3:
            names.add(part)
    
    # Common suffixes
    for fmt in BUCKET_FORMATS:
        names.add(fmt.format(domain_clean))
        if len(parts) > 1:
            names.add(fmt.format('-'.join(parts[:-1])))
    
    return list(names)[:100]  # Limit to 100 permutations

def process_domain(domain):
    """Process a single domain for cloud assets."""
    print(f"[*] Processing domain: {domain}")
    bucket_names = generate_bucket_names(domain)
    
    results = []
    
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        futures = []
        for bucket in bucket_names:
            for endpoint_name, endpoint_fmt in ENDPOINTS.items():
                url = endpoint_fmt.format(bucket)
                futures.append(executor.submit(check_endpoint, f"{endpoint_name}:{bucket}", url))
        
        for future in concurrent.futures.as_completed(futures):
            result = future.result()
            if result:
                results.append(result)
    
    return results

def main():
    if len(sys.argv) > 1:
        domains = sys.argv[1:]
    else:
        # Try to read from apple_subs.txt
        try:
            with open('apple_subs.txt', 'r') as f:
                domains = [line.strip() for line in f if line.strip()]
                # Sample first 50 domains for testing
                domains = domains[:50]
        except FileNotFoundError:
            print("Usage: python3 cloud_discovery.py <domain1> <domain2> ...")
            print("Or create apple_subs.txt with subdomains")
            sys.exit(1)
    
    print(f"[*] Starting cloud asset discovery for {len(domains)} domains")
    
    all_results = []
    for domain in domains:
        results = process_domain(domain)
        all_results.extend(results)
    
    print("\n" + "="*80)
    print("CLOUD ASSET DISCOVERY RESULTS")
    print("="*80)
    
    for result in all_results:
        name, url, status, info, details = result
        if status in [200, 301, 302, 307, 308, 403]:
            print(f"[+] {name}")
            print(f"    URL: {url}")
            print(f"    Status: {status} - {info}")
            if details:
                print(f"    Details: {details}")
            print()

if __name__ == "__main__":
    main()