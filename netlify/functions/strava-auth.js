<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Swimming</title>
    <link rel="icon" href="images/swimming_favicon.ico">
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;600&display=swap" rel="stylesheet">
    <style>
        body {
            font-family: 'Poppins', sans-serif;
            background-image: linear-gradient(rgba(0, 0, 0, 0.6), rgba(0, 0, 0, 0.6)), url('background.jpg');
            background-size: cover;
            background-position: center;
            color: #212529;
            margin: 0;
            padding: 0;
            height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            flex-direction: column;
        }

        .strava-feed {
            padding: 20px;
            background-color: rgba(255, 255, 255, 0.8);
            border-radius: 10px;
            margin-top: 20px;
        }

        .activity {
            margin-bottom: 10px;
            padding: 10px;
            border-bottom: 1px solid #ccc;
        }

        button {
            padding: 10px 20px;
            background-color: #fc4c02;
            color: white;
            border: none;
            border-radius: 5px;
            font-size: 16px;
            cursor: pointer;
            margin-bottom: 20px;
        }

        button:hover {
            background-color: #e34400;
        }
    </style>
</head>
<body>

    <!-- Button to Trigger Strava Authentication -->
    <button id="auth-button">Connect with Strava</button>

    <div id="strava-feed" class="strava-feed">
        <h2>My Strava Swims</h2>
        <div id="activities"></div>
    </div>

    <script>
        // Function to fetch the Strava client ID from the server
        async function fetchClientId() {
            const response = await fetch('/.netlify/functions/get-strava-client-id');
            const data = await response.json();
            return data.clientId;
        }

        // Redirect to Strava for authorization
        async function authenticateStrava() {
            const clientId = await fetchClientId();
            const authUrl = `https://www.strava.com/oauth/authorize?client_id=${clientId}&response_type=code&redirect_uri=https://woodnott.com/callback&scope=activity:read_all`;
            window.location.href = authUrl;
        }

        // Handle the OAuth callback and fetch activities
        async function handleCallback() {
            const urlParams = new URLSearchParams(window.location.search);
            const code = urlParams.get('code');

            if (code) {
                // Fetch activities using the Netlify function with the authorization code
                const response = await fetch(`/.netlify/functions/strava-auth?code=${code}`);
                const activities = await response.json();

                const activitiesContainer = document.getElementById('activities');
                activitiesContainer.innerHTML = '';

                if (activities.length > 0) {
                    activities.forEach(activity => {
                        const activityElement = document.createElement('div');
                        activityElement.classList.add('activity');
                        activityElement.innerHTML = `<strong>${activity.name}</strong> - ${activity.distance} meters`;
                        activitiesContainer.appendChild(activityElement);
                    });
                } else {
                    activitiesContainer.innerHTML = 'No recent swims found.';
                }
            }
        }

        // Event listener for the "Connect with Strava" button
        document.getElementById('auth-button').addEventListener('click', authenticateStrava);

        // Check if the user has been redirected to the callback URL
        if (window.location.pathname === '/callback') {
            handleCallback();
        }
    </script>

</body>
</html>
