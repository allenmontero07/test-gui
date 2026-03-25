// ── CONFIG ────────────────────────────────────────────
const API_KEY = CONFIG.API_KEY;
const BASE_URL = CONFIG.BASE_URL;
const IMG_BASE = CONFIG.IMG_BASE;

// ── STATE ─────────────────────────────────────────────
const cache = new Map(); 
let controller = null;
let debounceTimer = null;
let activeIndex = -1;
let currentQuery = '';
let currentResults = [];

// ── DOM REFS ──────────────────────────────────────────
const searchInput = document.getElementById('search-input');
const resultList = document.getElementById('result-list');
const resultHeader = document.getElementById('results-header');
const statusBar = document.getElementById('status-bar');
const detailEmpty = document.getElementById('detail-empty');
const detailContent = document.getElementById('detail-content');
const template = document.getElementById('result-template');
const searchWrap = searchInput.closest('[data-loading]');

// ── XSS HARDENING  ──────────────────
function buildHighlightedTitle(title, query) {
    const container = document.createElement("span");
    const idx = title.toLowerCase().indexOf(query.toLowerCase());

    if (idx === -1) {
        container.textContent = title;
        return container;
    }

    container.appendChild(document.createTextNode(title.slice(0, idx)));
    const mark = document.createElement("span");
    mark.className = "highlight";
    mark.textContent = title.slice(idx, idx + query.length);
    container.appendChild(mark);
    container.appendChild(document.createTextNode(title.slice(idx + query.length)));

    return container;
}

// ── SEARCH LOGIC WITH CACHE & ABORT ───────────────────
async function performSearch(rawQuery) {
    const query = rawQuery.toLowerCase().trim();
    if (!query || query.length < 3) return;

    // 1. CHECK CACHE FIRST — instant return, zero network
    if (cache.has(query)) {
        console.log("⚡ [CACHE HIT]:", query);
        const cached = cache.get(query);
        const cachedResults = Array.isArray(cached) ? cached : (cached.results || []);
        renderResults(cachedResults, query);
        searchWrap.dataset.loading = 'false';
        statusBar.textContent = `${cachedResults.length} RESULTS · CACHED`;
        return; 
    }

    console.log("[CACHE MISS] Fetching for:", query);
    
    // 2. ABORT ANY IN-FLIGHT REQUEST FOR A DIFFERENT QUERY
    if (controller && currentQuery !== query) {
        console.log("[ABORT] Cancelling previous request for:", currentQuery);
        controller.abort();
    }
    
    currentQuery = query;
    controller = new AbortController();
    searchWrap.dataset.loading = 'true';
    statusBar.textContent = 'FETCHING…';

    try {
        const url = `${BASE_URL}/search/movie?query=${encodeURIComponent(query)}&language=en-US&page=1&api_key=${API_KEY}&t=${Date.now()}&r=${Math.random()}`;
        const response = await fetch(url, { 
            signal: controller.signal,
            cache: 'no-store',
            headers: {
                'accept': 'application/json'
            }
        });

        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        const results = data.results || [];

        // 3. STORE IN CACHE FOR FUTURE SEARCHES
        cache.set(query, results);
        console.log("✓ Cached", results.length, "results for:", query);
        
        renderResults(results, query);
        statusBar.textContent = `${results.length} RESULTS · NETWORK`;

    } catch (error) {
        if (error.name === 'AbortError') {
            console.log("[ABORT] Request cancelled for:", query);
            return;
        }
        console.error("[ERROR]", error.message);
        statusBar.textContent = 'ERROR FETCHING DATA';
    } finally {
        if (!controller.signal.aborted) {
            searchWrap.dataset.loading = 'false';
            currentQuery = '';
        }
    }
}

// ── RENDERING & NAVIGATION ──────────────────────────
function renderResults(movies, query) {
    const frag = new DocumentFragment();
    resultList.innerHTML = '';
    activeIndex = -1;
    currentResults = movies;

    movies.forEach((movie, i) => {
        const clone = template.content.cloneNode(true);
        const item = clone.querySelector('.result-item');
        
        clone.querySelector('.result-title').appendChild(buildHighlightedTitle(movie.title, query));
        
        const year = movie.release_date ? movie.release_date.split('-')[0] : 'N/A';
        clone.querySelector('.result-meta').textContent = `${year} · Movie`;
        
        const img = document.createElement('img');
        img.className = 'result-poster';
        img.src = movie.poster_path ? `${IMG_BASE}/w185${movie.poster_path}` : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="185" height="278"%3E%3Crect fill="%23333" width="185" height="278"/%3E%3Ctext x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%23999" font-size="14"%3ENo Image%3C/text%3E%3C/svg%3E';
        clone.querySelector('.result-poster-placeholder').replaceWith(img);

        item.addEventListener('click', () => selectMovie(i, movies));
        frag.appendChild(clone);
    });

    resultList.appendChild(frag);
}

// ── KEYBOARD NAV ──────────────────────────────────────
function setActive(idx) {
    const items = document.querySelectorAll('.result-item');
    activeIndex = idx;
    items.forEach((el, i) => {
        el.classList.toggle('active', i === idx);
        if (i === idx) {
            el.scrollIntoView({ block: 'nearest' });
            // Optional: auto-load details when navigating with keyboard arrows
            // (only if the movie exists in current search results)
            if (currentResults && currentResults[i]) {
                loadMovieDetails(currentResults[i]);
            }
        }
    });
}

function selectMovie(idx, list) {
    setActive(idx);
    loadMovieDetails(list[idx]);
}

// ── MOVIE DETAILS FETCHING ───────────────────────────
async function loadMovieDetails(movie) {
    const id = movie.id;
    
    // Hide empty state, show content
    detailEmpty.classList.add('hidden');
    detailContent.classList.remove('hidden');
    detailContent.removeAttribute('hidden');
    
    // Clear previous content
    document.getElementById('detail-title').textContent = '';
    document.getElementById('detail-year').textContent = '';
    document.getElementById('detail-rating').textContent = '';
    document.getElementById('detail-genres').innerHTML = '';
    document.getElementById('detail-overview').textContent = '';
    document.getElementById('detail-poster').src = '';
    document.getElementById('cast-list').innerHTML = '';
    document.getElementById('video-list').innerHTML = '';
    
    // Always fetch movie details (no detail caching)
    console.log("Fetching movie details for ID:", id);
    
    // Concurrent fetches
    const detailsUrl = `${BASE_URL}/movie/${id}?language=en-US&api_key=${API_KEY}`;
    const creditsUrl = `${BASE_URL}/movie/${id}/credits?language=en-US&api_key=${API_KEY}`;
    const videosUrl = `${BASE_URL}/movie/${id}/videos?language=en-US&api_key=${API_KEY}`;
    
    const promises = [
        fetch(detailsUrl).then(res => res.json()),
        fetch(creditsUrl).then(res => res.json()),
        fetch(videosUrl).then(res => res.json())
    ];
    
    const results = await Promise.allSettled(promises);
    
    renderMovieDetails(results);
}

// ── MOVIE DETAILS RENDERING ──────────────────────────
function renderMovieDetails(results) {
    if (results[0].status === 'fulfilled') {
        const data = results[0].value;
        document.getElementById('detail-title').textContent = data.title || 'N/A';
        const year = data.release_date ? data.release_date.split('-')[0] : 'N/A';
        document.getElementById('detail-year').textContent = year;
        document.getElementById('detail-rating').textContent = data.vote_average ? `${data.vote_average}/10` : 'N/A';
        const genres = data.genres ? data.genres.map(g => g.name).join(', ') : 'N/A';
        document.getElementById('detail-genres').textContent = genres;
        document.getElementById('detail-overview').textContent = data.overview || 'No overview available.';
        const posterSrc = data.poster_path ? `${IMG_BASE}/w500${data.poster_path}` : 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="500" height="750"%3E%3Crect fill="%23333" width="500" height="750"/%3E%3Ctext x="50%" y="50%" text-anchor="middle" dy=".3em" fill="%23999" font-size="20"%3ENo Image%3C/text%3E%3C/svg%3E';
        document.getElementById('detail-poster').src = posterSrc;
        document.getElementById('detail-poster').alt = data.title || 'Movie Poster';
    } else {
        // Handle failure, perhaps show error message
        document.getElementById('detail-title').textContent = 'Failed to load details';
    }
    
    // Handle credits
    if (results[1].status === 'fulfilled') {
        const data = results[1].value;
        const castList = document.getElementById('cast-list');
        const cast = data.cast ? data.cast.slice(0, 5) : [];
        cast.forEach(actor => {
            const li = document.createElement('li');
            li.textContent = `${actor.name} as ${actor.character}`;
            castList.appendChild(li);
        });
    } else {
        const castList = document.getElementById('cast-list');
        const errorLi = document.createElement('li');
        errorLi.textContent = 'Failed to load cast';
        castList.appendChild(errorLi);
    }
    
    // Handle videos
    if (results[2].status === 'fulfilled') {
        const data = results[2].value;
        const videoList = document.getElementById('video-list');
        const trailers = data.results ? data.results.filter(v => v.type === 'Trailer' && v.site === 'YouTube') : [];
        trailers.slice(0, 3).forEach(video => {
            const a = document.createElement('a');
            a.href = `https://www.youtube.com/watch?v=${video.key}`;
            a.textContent = video.name;
            a.target = '_blank';
            videoList.appendChild(a);
            videoList.appendChild(document.createElement('br'));
        });
    } else {
        const videoList = document.getElementById('video-list');
        const errorP = document.createElement('p');
        errorP.textContent = 'Failed to load videos';
        videoList.appendChild(errorP);
    }
}

// ── DEBOUNCED SEARCH INPUT ────────────────────────────
searchInput.addEventListener('input', () => {
    const query = searchInput.value.trim().toLowerCase();

    // Clear any pending debounce timer
    clearTimeout(debounceTimer);

    // Handle empty input
    if (!query) {
        if (controller) controller.abort();
        resultList.innerHTML = '';
        detailEmpty.classList.remove('hidden');
        detailContent.classList.add('hidden');
        detailContent.setAttribute('hidden', '');
        statusBar.textContent = 'READY';
        searchWrap.dataset.loading = 'false';
        return;
    }

    // Debounce: wait 300ms after last keystroke before searching
    debounceTimer = setTimeout(() => {
        performSearch(query);
    }, 300);
});

window.addEventListener('keydown', e => {
    const items = document.querySelectorAll('.result-item');
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();

        // if currently no selection, start at first
        if (activeIndex < 0) {
            setActive(0);
            return;
        }

        // move down through results
        if (activeIndex < items.length - 1) {
            setActive(activeIndex + 1);
        }
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();

        // when at first result, go back to search input
        if (activeIndex === 0) {
            activeIndex = -1;
            items.forEach((el) => el.classList.remove('active'));
            searchInput.focus();
            return;
        }

        // move up within results
        if (activeIndex > 0) {
            setActive(activeIndex - 1);
        }
    } else if (e.key === 'Enter' && activeIndex >= 0) {
        items[activeIndex].click();
    }
});