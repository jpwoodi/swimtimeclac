const fs = require('fs');
const path = require('path');

// Load templates from JSON file
function loadTemplates() {
    const candidatePaths = [
        path.join(__dirname, '..', '..', 'data', 'templates.v2.json'),
        path.join(process.cwd(), 'data', 'templates.v2.json'),
        path.join(__dirname, 'data', 'templates.v2.json')
    ];

    const templatesPath = candidatePaths.find((candidate) => fs.existsSync(candidate));

    if (!templatesPath) {
        throw new Error('Templates file not found. Please run: npm run ingest-templates-v2');
    }

    const rawData = fs.readFileSync(templatesPath, 'utf-8');
    return JSON.parse(rawData);
}

// Filter templates based on query parameters
function filterTemplates(templates, filters) {
    let filtered = templates;

    // Filter by plan type
    if (filters.type && filters.type !== 'all') {
        filtered = filtered.filter(t => t.plan_type_key === filters.type);
    }

    // Filter by difficulty
    if (filters.difficulty && filters.difficulty !== 'all') {
        filtered = filtered.filter(t => t.metadata.difficulty === filters.difficulty);
    }

    // Filter by distance range
    if (filters.minDistance) {
        const minDist = parseInt(filters.minDistance);
        filtered = filtered.filter(t =>
            t.metadata.distance_meters && t.metadata.distance_meters >= minDist
        );
    }

    if (filters.maxDistance) {
        const maxDist = parseInt(filters.maxDistance);
        filtered = filtered.filter(t =>
            t.metadata.distance_meters && t.metadata.distance_meters <= maxDist
        );
    }

    // Filter by pool type
    if (filters.poolType && filters.poolType !== 'all') {
        filtered = filtered.filter(t => t.metadata.pool_type === filters.poolType);
    }

    // Filter by equipment (must have ALL specified equipment)
    if (filters.equipment && filters.equipment.length > 0) {
        filtered = filtered.filter(t => {
            const planEquipment = t.metadata.equipment_required || [];
            return filters.equipment.every(eq => planEquipment.includes(eq));
        });
    }

    // Filter by focus areas
    if (filters.focusAreas && filters.focusAreas.length > 0) {
        filtered = filtered.filter(t => {
            const planFocus = t.metadata.focus_areas || [];
            return filters.focusAreas.some(focus => planFocus.includes(focus));
        });
    }

    // Text search in plan content
    if (filters.search && filters.search.trim().length > 0) {
        const searchTerm = filters.search.toLowerCase();
        filtered = filtered.filter(t =>
            t.raw_text.toLowerCase().includes(searchTerm) ||
            t.source_file.toLowerCase().includes(searchTerm)
        );
    }

    return filtered;
}

// Sort templates
function sortTemplates(templates, sortBy, sortOrder) {
    const sorted = [...templates];

    const sortFunctions = {
        date: (a, b) => {
            const dateA = a.metadata.date || '';
            const dateB = b.metadata.date || '';
            return dateA.localeCompare(dateB);
        },
        distance: (a, b) => {
            const distA = a.metadata.distance_meters || 0;
            const distB = b.metadata.distance_meters || 0;
            return distA - distB;
        },
        difficulty: (a, b) => {
            const diffOrder = { beginner: 1, intermediate: 2, advanced: 3, elite: 4 };
            const diffA = diffOrder[a.metadata.difficulty] || 2;
            const diffB = diffOrder[b.metadata.difficulty] || 2;
            return diffA - diffB;
        },
        name: (a, b) => a.source_file.localeCompare(b.source_file)
    };

    const sortFn = sortFunctions[sortBy] || sortFunctions.date;
    sorted.sort(sortFn);

    if (sortOrder === 'desc') {
        sorted.reverse();
    }

    return sorted;
}

// Paginate results
function paginateResults(templates, page, pageSize) {
    const totalCount = templates.length;
    const totalPages = Math.ceil(totalCount / pageSize);
    const currentPage = Math.max(1, Math.min(page, totalPages));
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;

    return {
        items: templates.slice(startIndex, endIndex),
        pagination: {
            currentPage,
            pageSize,
            totalPages,
            totalCount,
            hasNext: currentPage < totalPages,
            hasPrevious: currentPage > 1
        }
    };
}

// Get unique filter options from all templates
function getFilterOptions(templates) {
    const options = {
        types: new Set(),
        difficulties: new Set(),
        poolTypes: new Set(),
        equipment: new Set(),
        focusAreas: new Set(),
        distanceRange: { min: Infinity, max: 0 }
    };

    templates.forEach(template => {
        options.types.add(template.plan_type_key);
        options.difficulties.add(template.metadata.difficulty);
        if (template.metadata.pool_type) {
            options.poolTypes.add(template.metadata.pool_type);
        }
        (template.metadata.equipment_required || []).forEach(eq => options.equipment.add(eq));
        (template.metadata.focus_areas || []).forEach(fa => options.focusAreas.add(fa));

        const distance = template.metadata.distance_meters;
        if (distance) {
            options.distanceRange.min = Math.min(options.distanceRange.min, distance);
            options.distanceRange.max = Math.max(options.distanceRange.max, distance);
        }
    });

    return {
        types: Array.from(options.types).sort(),
        difficulties: Array.from(options.difficulties).sort(),
        poolTypes: Array.from(options.poolTypes).sort(),
        equipment: Array.from(options.equipment).sort(),
        focusAreas: Array.from(options.focusAreas).sort(),
        distanceRange: {
            min: options.distanceRange.min === Infinity ? 0 : options.distanceRange.min,
            max: options.distanceRange.max
        }
    };
}

exports.handler = async function(event, context) {
    // Support GET requests
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        // Load all templates
        const templatesData = loadTemplates();
        const allTemplates = templatesData.templates || [];

        // Parse query parameters
        const params = event.queryStringParameters || {};

        // Special endpoint to get filter options
        if (params.action === 'getFilterOptions') {
            const filterOptions = getFilterOptions(allTemplates);
            return {
                statusCode: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({
                    filterOptions,
                    totalPlans: allTemplates.length,
                    version: templatesData.version
                })
            };
        }

        // Build filters from query params
        const filters = {
            type: params.type,
            difficulty: params.difficulty,
            minDistance: params.minDistance,
            maxDistance: params.maxDistance,
            poolType: params.poolType,
            equipment: params.equipment ? params.equipment.split(',') : [],
            focusAreas: params.focusAreas ? params.focusAreas.split(',') : [],
            search: params.search
        };

        // Apply filters
        let filtered = filterTemplates(allTemplates, filters);

        // Apply sorting
        const sortBy = params.sortBy || 'date';
        const sortOrder = params.sortOrder || 'desc';
        filtered = sortTemplates(filtered, sortBy, sortOrder);

        // Apply pagination
        const page = parseInt(params.page) || 1;
        const pageSize = parseInt(params.pageSize) || 20;
        const paginated = paginateResults(filtered, page, pageSize);

        // Return results
        return {
            statusCode: 200,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            body: JSON.stringify({
                plans: paginated.items,
                pagination: paginated.pagination,
                filters: filters
            })
        };

    } catch (error) {
        console.error('Browse error:', error.message);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: error.message,
                hint: 'Make sure to run: npm run ingest-templates-v2'
            })
        };
    }
};
