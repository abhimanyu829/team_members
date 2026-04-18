import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
import boto3
from dotenv import load_dotenv

load_dotenv()

async def test_mongodb():
    print("\n--- Testing MongoDB Connectivity ---")
    mongo_url = os.environ.get("MONGO_URL")
    db_name = os.environ.get("DB_NAME")
    try:
        client = AsyncIOMotorClient(mongo_url)
        await client.admin.command('ismaster')
        print(f"[OK] Successfully connected to MongoDB Atlas: {mongo_url.split('@')[-1].split('/')[0]}")
        db = client[db_name]
        collections = await db.list_collection_names()
        print(f"[OK] Found {len(collections)} collections in database '{db_name}'")
    except Exception as e:
        print(f"[ERROR] MongoDB Connection Failed: {e}")

def test_s3():
    print("\n--- Testing AWS S3 Connectivity ---")
    access_key = os.environ.get("AWS_ACCESS_KEY_ID")
    secret_key = os.environ.get("AWS_SECRET_ACCESS_KEY")
    bucket_name = os.environ.get("AWS_S3_BUCKET_NAME")
    region = os.environ.get("AWS_REGION", "ap-south-1")

    try:
        s3 = boto3.client(
            's3',
            aws_access_key_id=access_key,
            aws_secret_access_key=secret_key,
            region_name=region
        )
        response = s3.list_objects_v2(Bucket=bucket_name, MaxKeys=1)
        print(f"[OK] Successfully connected to AWS S3 Bucket: {bucket_name}")
        if 'Contents' in response:
            print(f"[OK] Bucket is accessible and contains objects.")
        else:
            print(f"[OK] Bucket is accessible but currently empty.")
    except Exception as e:
        print(f"[ERROR] AWS S3 Connection Failed: {e}")

async def main():
    await test_mongodb()
    test_s3()

if __name__ == "__main__":
    asyncio.run(main())
