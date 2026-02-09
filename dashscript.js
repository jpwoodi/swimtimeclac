// dashscript.js — Stripe-inspired dashboard

// Stripe design tokens for charts
const CHART_COLORS = {
    purple: 'rgba(99, 91, 255, 0.75)',
    purpleBorder: 'rgba(99, 91, 255, 1)',
    orange: 'rgba(239, 108, 0, 0.75)',
    green: 'rgba(46, 125, 50, 0.75)',
    greenFill: 'rgba(46, 125, 50, 0.08)',
    violet: 'rgba(142, 36, 170, 0.75)',
    violetFill: 'rgba(142, 36, 170, 0.08)',
    gridLine: '#f0f3f7',
    tickColor: '#8792a2',
};

const CHART_DEFAULTS = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: { display: false },
        tooltip: {
            backgroundColor: '#1a1f36',
            titleFont: { family: 'Inter', weight: '600' },
            bodyFont: { family: 'Inter' },
            padding: 12,
            cornerRadius: 8,
        }
    },
    scales: {
        x: {
            grid: { display: false },
            border: { display: false },
            ticks: { font: { family: 'Inter', size: 12 }, color: CHART_COLORS.tickColor },
        },
        y: {
            grid: { color: CHART_COLORS.gridLine },
            border: { display: false },
            ticks: { font: { family: 'Inter', size: 12 }, color: CHART_COLORS.tickColor },
            beginAtZero: true,
        }
    }
};

function formatPace(paceInSecondsPerMeter) {
    const pacePer100m = paceInSecondsPerMeter * 100;
    const minutes = Math.floor(pacePer100m / 60);
    const seconds = Math.round(pacePer100m % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
}

async function fetchSwimData() {
    try {
        const response = await fetch('/.netlify/functions/get-swims');
        if (!response.ok) throw new Error(`HTTP error: ${response.status}`);
        return await response.json();
    } catch (error) {
        console.error('Error fetching swim data:', error);
        return [];
    }
}

function groupDataByMonth(swimData) {
    const monthlyData = {};
    swimData.forEach(session => {
        const month = moment(session.start_date).format('YYYY-MM');
        if (!monthlyData[month]) {
            monthlyData[month] = { totalDistance: 0, totalTime: 0, sessions: 0, totalPace: 0, swolfSum: 0, hasSwolf: false };
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

function processData(swimData) {
    return {
        totalDistance: swimData.reduce((t, s) => t + s.distance, 0),
        totalTime: swimData.reduce((t, s) => t + s.moving_time, 0),
        averagePace: swimData.reduce((t, s) => t + s.moving_time, 0) / swimData.reduce((t, s) => t + s.distance, 0),
        totalCalories: swimData.reduce((t, s) => t + (s.calories || 0), 0),
        numberOfSessions: swimData.length,
    };
}

function updateOverview(processedData) {
    document.getElementById('stats-row').style.display = 'flex';

    document.getElementById('total-distance').innerHTML = `
        <div class="stat-label">Total Distance</div>
        <div class="stat-value">${(processedData.totalDistance / 1000).toFixed(1)} km</div>
    `;
    document.getElementById('total-time').innerHTML = `
        <div class="stat-label">Total Time</div>
        <div class="stat-value">${(processedData.totalTime / 3600).toFixed(1)} hrs</div>
    `;
    document.getElementById('average-pace').innerHTML = `
        <div class="stat-label">Avg Pace</div>
        <div class="stat-value">${formatPace(processedData.averagePace)} /100m</div>
    `;
    document.getElementById('total-calories').innerHTML = `
        <div class="stat-label">Calories</div>
        <div class="stat-value">${Math.round(processedData.totalCalories).toLocaleString()}</div>
    `;
    document.getElementById('number-of-sessions').innerHTML = `
        <div class="stat-label">Sessions</div>
        <div class="stat-value">${processedData.numberOfSessions}</div>
    `;
}

function createDistanceChart(swimData) {
    const monthlyData = groupDataByMonth(swimData);
    const labels = Object.keys(monthlyData);
    const distances = Object.values(monthlyData).map(d => (d.totalDistance / 1000).toFixed(2));

    new Chart(document.getElementById('distanceChart').getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data: distances,
                backgroundColor: CHART_COLORS.purple,
                borderRadius: 4,
                borderWidth: 0,
                borderSkipped: false,
            }]
        },
        options: {
            ...CHART_DEFAULTS,
            plugins: {
                ...CHART_DEFAULTS.plugins,
                tooltip: {
                    ...CHART_DEFAULTS.plugins.tooltip,
                    callbacks: { label: (ctx) => `${ctx.parsed.y} km` }
                }
            }
        }
    });
}

function createTimeChart(swimData) {
    const monthlyData = groupDataByMonth(swimData);
    const labels = Object.keys(monthlyData);
    const times = Object.values(monthlyData).map(d => (d.totalTime / 60).toFixed(0));

    new Chart(document.getElementById('timeChart').getContext('2d'), {
        type: 'bar',
        data: {
            labels,
            datasets: [{
                data: times,
                backgroundColor: CHART_COLORS.orange,
                borderRadius: 4,
                borderWidth: 0,
                borderSkipped: false,
            }]
        },
        options: {
            ...CHART_DEFAULTS,
            plugins: {
                ...CHART_DEFAULTS.plugins,
                tooltip: {
                    ...CHART_DEFAULTS.plugins.tooltip,
                    callbacks: { label: (ctx) => `${ctx.parsed.y} min` }
                }
            }
        }
    });
}

function createPaceChart(swimData) {
    const monthlyData = groupDataByMonth(swimData);
    const labels = Object.keys(monthlyData);
    const paces = Object.values(monthlyData).map(d => {
        const avgPace = d.totalPace / d.sessions;
        return (avgPace * 100).toFixed(0);
    });

    new Chart(document.getElementById('paceChart').getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [{
                data: paces,
                borderColor: CHART_COLORS.green,
                backgroundColor: CHART_COLORS.greenFill,
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                pointBackgroundColor: CHART_COLORS.green,
            }]
        },
        options: {
            ...CHART_DEFAULTS,
            scales: {
                ...CHART_DEFAULTS.scales,
                y: { ...CHART_DEFAULTS.scales.y, reverse: true }
            },
            plugins: {
                ...CHART_DEFAULTS.plugins,
                tooltip: {
                    ...CHART_DEFAULTS.plugins.tooltip,
                    callbacks: { label: (ctx) => `${ctx.parsed.y} sec/100m` }
                }
            }
        }
    });
}

function createSwolfChart(swimData) {
    const monthlyData = groupDataByMonth(swimData);
    const labels = [];
    const swolfValues = [];

    Object.entries(monthlyData).forEach(([month, data]) => {
        if (data.hasSwolf) {
            labels.push(month);
            swolfValues.push((data.swolfSum / data.sessions).toFixed(1));
        }
    });

    if (swolfValues.length === 0) {
        document.getElementById('swolfChart').parentElement.innerHTML =
            '<p style="text-align:center;color:#8792a2;padding:40px 0;font-size:14px;">No SWOLF data available</p>';
        return;
    }

    new Chart(document.getElementById('swolfChart').getContext('2d'), {
        type: 'line',
        data: {
            labels,
            datasets: [{
                data: swolfValues,
                borderColor: CHART_COLORS.violet,
                backgroundColor: CHART_COLORS.violetFill,
                fill: true,
                tension: 0.3,
                pointRadius: 4,
                pointBackgroundColor: CHART_COLORS.violet,
            }]
        },
        options: {
            ...CHART_DEFAULTS,
            scales: {
                ...CHART_DEFAULTS.scales,
                y: { ...CHART_DEFAULTS.scales.y, reverse: true }
            },
            plugins: {
                ...CHART_DEFAULTS.plugins,
                tooltip: {
                    ...CHART_DEFAULTS.plugins.tooltip,
                    callbacks: { label: (ctx) => `SWOLF: ${ctx.parsed.y}` }
                }
            }
        }
    });
}

async function initDashboard() {
    const spinner = document.getElementById('loading-spinner');
    const swimData = await fetchSwimData();

    if (spinner) spinner.style.display = 'none';

    if (!swimData || swimData.length === 0) {
        document.getElementById('total-distance').innerHTML =
            '<div class="stat-label">Status</div><div class="stat-value">No data</div>';
        document.getElementById('stats-row').style.display = 'flex';
        return;
    }

    swimData.sort((a, b) => new Date(a.start_date) - new Date(b.start_date));

    const processedData = processData(swimData);
    updateOverview(processedData);
    createDistanceChart(swimData);
    createTimeChart(swimData);
    createPaceChart(swimData);
    createSwolfChart(swimData);
}

window.onload = initDashboard;
