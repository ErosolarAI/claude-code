#!/usr/bin/env python3
"""
Vulnerable Flask Application for Security Testing
Simulates common web vulnerabilities for testing security tools
"""

from flask import Flask, request, render_template_string, redirect, session
import sqlite3
import os
import hashlib
import json

app = Flask(__name__)
app.secret_key = 'insecure_secret_key_for_testing'

# Vulnerable SQLite database setup
def init_db():
    conn = sqlite3.connect('test.db')
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS users
                 (id INTEGER PRIMARY KEY, username TEXT, password TEXT)''')
    c.execute('''CREATE TABLE IF NOT EXISTS messages
                 (id INTEGER PRIMARY KEY, content TEXT, user_id INTEGER)''')
    # Add test data
    c.execute("INSERT OR IGNORE INTO users (username, password) VALUES ('admin', 'admin123')")
    c.execute("INSERT OR IGNORE INTO users (username, password) VALUES ('test', 'password123')")
    conn.commit()
    conn.close()

init_db()

@app.route('/')
def index():
    return '''
    <h1>Test Web Application</h1>
    <ul>
        <li><a href="/login">Login (SQL Injection vulnerable)</a></li>
        <li><a href="/search">Search (XSS vulnerable)</a></li>
        <li><a href="/upload">File Upload (Path Traversal)</a></li>
        <li><a href="/api/users">API (Insecure Direct Object Reference)</a></li>
        <li><a href="/admin">Admin Panel (Broken Access Control)</a></li>
    </ul>
    '''

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form.get('username', '')
        password = request.form.get('password', '')
        
        # VULNERABLE: SQL Injection
        conn = sqlite3.connect('test.db')
        c = conn.cursor()
        query = f"SELECT * FROM users WHERE username='{username}' AND password='{password}'"
        c.execute(query)
        user = c.fetchone()
        conn.close()
        
        if user:
            session['user_id'] = user[0]
            session['username'] = user[1]
            return f'Logged in as {user[1]}'
        else:
            return 'Login failed'
    
    return '''
    <form method="post">
        Username: <input type="text" name="username"><br>
        Password: <input type="password" name="password"><br>
        <input type="submit" value="Login">
    </form>
    <p>Test with: admin'-- (SQL Injection)</p>
    '''

@app.route('/search')
def search():
    query = request.args.get('q', '')
    # VULNERABLE: Reflected XSS
    return f'''
    <h1>Search Results for: {query}</h1>
    <form>
        <input type="text" name="q" value="{query}">
        <input type="submit" value="Search">
    </form>
    <p>Test with: <script>alert('xss')</script></p>
    '''

@app.route('/upload', methods=['GET', 'POST'])
def upload():
    if request.method == 'POST':
        file = request.files.get('file')
        if file:
            # VULNERABLE: Path traversal
            filename = request.form.get('filename', file.filename)
            file.save(f'uploads/{filename}')
            return f'File saved as {filename}'
    
    return '''
    <form method="post" enctype="multipart/form-data">
        File: <input type="file" name="file"><br>
        Filename: <input type="text" name="filename" value="test.txt"><br>
        <input type="submit" value="Upload">
    </form>
    <p>Test with: ../../../etc/passwd</p>
    '''

@app.route('/api/users/<user_id>')
def get_user(user_id):
    # VULNERABLE: Insecure Direct Object Reference
    conn = sqlite3.connect('test.db')
    c = conn.cursor()
    c.execute(f"SELECT * FROM users WHERE id={user_id}")
    user = c.fetchone()
    conn.close()
    
    if user:
        return json.dumps({'id': user[0], 'username': user[1]})
    return 'User not found'

@app.route('/admin')
def admin():
    # VULNERABLE: Broken Access Control
    if session.get('username') == 'admin':
        return 'Admin panel: Welcome admin!'
    return 'Access denied. Only admin can view this page.'

@app.route('/debug')
def debug():
    # VULNERABLE: Information disclosure
    return f'''
    <pre>
    Session: {dict(session)}
    Headers: {dict(request.headers)}
    Args: {dict(request.args)}
    </pre>
    '''

if __name__ == '__main__':
    # Create uploads directory
    os.makedirs('uploads', exist_ok=True)
    
    # Run with debug enabled (another vulnerability)
    app.run(host='127.0.0.1', port=8080, debug=True)