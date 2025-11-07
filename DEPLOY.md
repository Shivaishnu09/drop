# Deployment Guide

## Prerequisites

1. A Render account (https://render.com)
2. GitHub repository with your backend code

## Setup Steps

1. Create a new Web Service on Render
   - Connect your GitHub repository
   - Select the branch you want to deploy (e.g., `main`)
   - Choose Node.js as the runtime
   - Set the build command: `npm install`
   - Set the start command: `node index.js`

2. Configure Environment Variables
   - Add the following environment variables in Render dashboard:
     - `PORT`: The port your app will run on (Render will set this automatically)
     - `FRONTEND_URL`: Your Netlify frontend URL
     - `NETLIFY_URL`: Your Netlify frontend URL (same as above)

3. GitHub Actions Setup
   - In your GitHub repository settings, go to Secrets and Variables > Actions
   - Add the following secrets:
     - `RENDER_SERVICE_ID`: Your Render service ID
     - `RENDER_API_KEY`: Your Render API key

## Deployment

The deployment will automatically trigger when you push to the main branch. You can also manually trigger it from the GitHub Actions tab.

## Troubleshooting

1. If you encounter CORS issues:
   - Verify that your frontend URL is correctly set in the environment variables
   - Check the CORS configuration in `index.js`

2. If files aren't being uploaded:
   - Make sure the `/tmp/uploads` directory exists
   - Check file permissions

3. For other issues:
   - Check Render logs in the dashboard
   - Verify all environment variables are set correctly