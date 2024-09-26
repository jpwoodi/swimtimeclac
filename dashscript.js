// dashscript.js

// Helper function to format pace in minutes and seconds per 100 meters
function formatPace(paceInSecondsPerMeter) {
    const pacePer100m = paceInSecondsPerMeter * 100;
    const minutes = Math.floor(pacePer100m / 60);
    const seconds = Math.round(pacePer100m % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

// Function to fetch swim data from the serverless function
async function fetchSwimData() {
    try {
        const response = await fetch('/.netlify/functions/get-swims');
        const data = await response.json();
        console.log(data);
        return data;
    } catch (error) {
        console.error('Error fetching swim data:', error);
    }
}

// Group swim data by month
function groupDataByMonth(swimData) {
    const monthlyData = {};
    
    swimData.forEach(session => {
        const month = moment(session.start_date).format('YYYY-MM'); // Group by year and month

        if (!monthlyData[month]) {
            monthlyData[month] = {
                totalDistance: 0,
                totalTime: 0,
                sessions: 0,
                totalPace: 0,
                swolfSum: 0,
                hasSwolf: false
            };
        }

        monthlyData[month].totalDistance += session.distance;
        monthlyData[month].totalTime += session.moving_time;
        monthlyData[month].totalPace += session.moving_time / session.distance;
        monthlyData[month].sessions += 1;

        if (session.swim_swolf) {
            monthlyData[month].swolfSum += session.swim_swolf;
            monthlyData[month].hasSwolf = true;
        }
    });

    return monthlyData;
}

// Process the fetched data to compute metrics
function processData(swimData) {
    const processedData = {};

    // Total Distance
    processedData.totalDistance = swimData.reduce((total, session) => total + session.distance, 0);

    // Total Time
    processedData.totalTime = swimData.reduce((total, session) => total + session.moving_time, 0);

    // Average Pace
    processedData.averagePace = processedData.totalTime / processedData.totalDistance;

    // Total Calories
    processedData.totalCalories = swimData.reduce((total, session) => total + (session.calories || 0), 0);

    // Number of Sessions
    processedData.numberOfSessions = swimData.length;

    return processedData;
}

// Update the Overview Section
function updateOverview(processedData) {
    document.getElementById('total-distance').innerHTML = `
        <h3>Total Distance</h3>
        <p>${(processedData.totalDistance / 1000).toFixed(2)} km</p>
    `;

    document.getElementById('total-time').innerHTML = `
        <h3>Total Time</h3>
        <p>${(processedData.totalTime / 3600).toFixed(2)} hours</p>
    `;

    document.getElementById('average-pace').innerHTML = `
        <h3>Average Pace</h3>
        <p>${formatPace(processedData.averagePace)} /100m</p>
    `;

    document.getElementById('total-calories').innerHTML = `
        <h3>Total Calories</h3>
        <p>${Math.round(processedData.totalCalories)} kcal</p>
    `;

    document.getElementById('number-of-sessions').innerHTML = `
        <h3>Number of Sessions</h3>
        <p>${processedData.numberOfSessions}</p>
    `;
}

// Create the Distance Chart
function createDistanceChart(swimData) {
    const monthlyData = groupDataByMonth(swimData);
    const labels = Object.keys(monthlyData); 
    const distances = Object.values(monthlyData).map(data => (data.totalDistance / 1000).toFixed(2)); 

    const ctx = document.getElementById('distanceChart').getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Distance (km)',
                data: distances,
                backgroundColor: '#0277bd',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false, // This disables automatic aspect ratio calculation
            scales: {
                x: { display: true },
                y: { display: true }
            }
        }
    });
}

// Create the Time Chart
function createTimeChart(swimData) {
    const monthlyData = groupDataByMonth(swimData);
    const labels = Object.keys(monthlyData);
    const times = Object.values(monthlyData).map(data => (data.totalTime / 60).toFixed(2)); 

    const ctx = document.getElementById('timeChart').getContext('2d');
    new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Time (minutes)',
                data: times,
                backgroundColor: '#ef6c00',
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false, // Disable default aspect ratio to allow custom height
            scales: {
                x: { display: true },
                y: { display: true }
            }
        }
    });
}

// Main function to initialize the dashboard
async function initDashboard() {
    const swimData = await fetchSwimData();

    // Sort swimData by date
    swimData.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));

    const processedData = processData(swimData);

    // Update Overview Section
    updateOverview(processedData);

    // Create Charts using monthly data
    createDistanceChart(swimData);
    createTimeChart(swimData);
    createPaceChart(swimData);
    createSwolfChart(swimData); // If SWOLF data is available
}

// Call the main function on page load
window.onload = initDashboard;
