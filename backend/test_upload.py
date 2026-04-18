import urllib.request, json, os, uuid, sys
sys.path.append(os.getcwd())
from server import create_access_token, db, app
from datetime import datetime, timezone
import asyncio

async def test_upload():
    # 1. ensure there's a user
    user_id = 'testuser123'
    await db.users.update_one({'email': 'test@test.com'}, {'$set': {'user_id': user_id, 'is_active': True, 'role': 'super_admin'}}, upsert=True)
    
    # 2. generate token
    token = create_access_token(user_id, 'test@test.com')
    
    payload = {
        'project_id': '4044680601076201931', 
        'department_id': 'testdept', 
        'module_name': 'General',
        'file_name': 'test.pdf',
        'file_size': 12345,
        'mime_type': 'application/pdf',
        'file_category': 'Other',
        'environment': 'development',
        'repository_branch': 'main',
        'tags': []
    }
    
    data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request('http://127.0.0.1:8000/api/assets/upload-session', data=data, headers={
        'Content-Type': 'application/json',
        'Origin': 'http://localhost:3000',
        'Cookie': f'access_token={token}'
    })
    
    try:
        with urllib.request.urlopen(req) as response:
            print('Success!', response.read().decode())
    except urllib.error.HTTPError as e:
        print('HTTPError:', e.code)
        print(e.read().decode())
    except Exception as e:
        print('Failed:', e)

asyncio.run(test_upload())
