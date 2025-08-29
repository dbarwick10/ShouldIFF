export const getChartOptions = (stat, maxTimeInMinutes) => ({
    responsive: true,
    animation: false,
    maintainAspectRatio: true,
    plugins: {
        title: { 
            display: true, 
            text: getChartTitle(stat),
            font: {
                size: 16,
                weight: 'bold'
            }
        },
        tooltip: {
            enabled: false,
            mode: 'nearest',
            intersect: false,
            callbacks: {
                label: function(context) {
                    return generateTooltipLabel(context, stat);
                }
            }
        },
        legend: {
            display: false,
            position: 'top'
        }
    },
    scales: {
        x: {
            type: 'linear',
            position: 'bottom',
            min: 0,
            max: maxTimeInMinutes,
            title: { 
                display: true, 
                text: stat === 'deathTimers' ? 'Game Time (Minutes)' : 'Game Time (Minutes)',
                font: {
                    weight: 'bold'
                }
            },
            ticks: {
                callback: value => value.toFixed(0),
                stepSize: Math.max(1, Math.ceil(maxTimeInMinutes / 10))
            }
        },
        y: { 
            title: { 
                display: true, 
                text: getYAxisTitle(stat),
                font: {
                    weight: 'bold'
                }
            },
            beginAtZero: true,
            // max: Math.max(2, data.length),
            min: 0,
            suggestedMin: 0,
            ...(stat === 'riftHeralds' || stat === 'atakhans' ? {
                max: 2,
                ticks: { display: false, stepSize: 1 }
            } : stat !== 'deathTimers' && stat !== 'kda' && stat !== 'itemPurchases' ? {
                ticks: { stepSize: 1 }
            } : {})
        }
    },
    animation: { duration: 0 }
});

function getChartTitle(stat) {
    switch(stat) {
        case 'deathTimers': return 'Total Time Spent Dead';
        case 'kda': return 'KDA Over Time';
        case 'turrets': return 'Towers Destroyed Over Time';
        case 'inhibitors': return 'Inhibitors Destroyed Over Time';
        case 'itemPurchases': return 'Gold Over Time';
        case 'hordeKills': return 'Voidgrub Kills Over Time';
        case 'riftHeralds': return 'Rift Herald Kills Over Time';
        case 'barons': return 'Baron Kills Over Time';
        case 'dragons': return 'Dragon Kills Over Time';
        case 'elders': return 'Elder Dragon Kills Over Time';
        case 'atakhans': return 'Atakhan Kills Over Time';
        default: return capitalizeFirstLetter(stat) + ' Over Time';
    }
}

function getYAxisTitle(stat) {
    switch(stat) {
        case 'deathTimers': return 'Time Spent Dead (Minutes)';
        case 'kda': return 'KDA';
        case 'turrets': return 'Total Towers Destroyed';
        case 'inhibitors': return 'Total Inhibitors Destroyed';
        case 'itemPurchases': return 'Total Gold';
        case 'hordeKills': return 'Total Voidgrub Kills';
        case 'riftHeralds': return 'Total Rift Herald Kills';
        case 'barons': return 'Total Baron Kills';
        case 'dragons': return 'Total Dragon Kills';
        case 'elders': return 'Total Elder Dragon Kills';
        case 'atakhans': return 'Total Atakhan Kills';
        default: return `Total ${capitalizeFirstLetter(stat)}`;
    }
}

function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
}

function generateTooltipLabel(context, stat) {
    const label = context.dataset.label || '';
    const value = context.parsed.y;
    const time = context.parsed.x.toFixed(1);
    
    if (label.includes('Trend')) {
        const stats = calculateTrendlineStats(context.dataset.data);
        if (stats) {
            const rateOfChange = (stats.slope * 60).toFixed(2);
            return [
                `${label}: ${value.toFixed(2)} at ${time} min`,
                `Rate of change: ${rateOfChange} per minute`,
                `R² = ${stats.rSquared.toFixed(3)}`
            ];
        }
    }
    
    switch(stat) {
        case 'deathTimers':
            return `${label}: ${value.toFixed(1)}s at ${time} min`;
        case 'kda':
            return `${label}: ${value.toFixed(2)} at ${time} min`;
        case 'itemPurchases':
            return `${label}: ${value.toFixed(0)} gold at ${time} min`;
        default:
            return `${label}: ${value} at ${time} min`;
    }
}
