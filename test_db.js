const https = require('https');

const options = {
    hostname: 'ogkderjuhbcewpuigsql.supabase.co',
    port: 443,
    path: '/rest/v1/leaderboard?select=*',
    method: 'GET',
    headers: {
        'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9na2Rlcmp1aGJjZXdwdWlnc3FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTIzMTQsImV4cCI6MjA5MDAyODMxNH0.cruYgVyH9ClTjTEDCUWm2K6YZBnM7CFbmahuAZkELS0',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9na2Rlcmp1aGJjZXdwdWlnc3FsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTIzMTQsImV4cCI6MjA5MDAyODMxNH0.cruYgVyH9ClTjTEDCUWm2K6YZBnM7CFbmahuAZkELS0'
    }
};

const req = https.request(options, res => {
    let d = '';
    res.on('data', chunk => d += chunk);
    res.on('end', () => {
        console.log('STATUS:', res.statusCode);
        console.log('BODY:', d);
    });
});

req.on('error', error => {
    console.error('NETWORK_ERROR:', error);
});

req.end();
