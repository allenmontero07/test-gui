class SearchComponent {
  constructor(apiKey, containerSelector) {
    this.apiKey = apiKey;
    this.baseUrl = "https://api.themoviedb.org/3";

    // --- STATE ---
    this.cache = new Map(); // Req 4: Caching
    this.abortController = null; // Req 1: Abort Pattern
    this.debounceTimer = null; // Req 1: Debounce
    this.results = []; // Current search results
    this.activeIndex = -1; // Req 5: Keyboard Nav

    //dom
    this.container = document.querySelector(containerSelector);
    this.input = this.container.querySelector("#search-input");
    this.resultsList = this.container.querySelector(".results-list");
    this.detailSection = this.container.querySelector(".detail-section");
    this.detailContent = this.container.querySelector(".detail-content");
    this.detailPlaceholder = this.container.querySelector(
      ".detail-placeholder",
    );

    // Req 3: Template
    this.template = document.querySelector("#movie-item-template");

    if (!this.template) {
      console.error("Template #movie-item-template not found!");
    }

    this.init();
  }

  init() {
    this.input.addEventListener("input", (e) => this.handleInput(e));
    this.input.addEventListener("keydown", (e) => this.handleKeydown(e));


    this.resultsList.addEventListener("click", (e) => {
      const item = e.target.closest(".movie-item");
      if (item) {
        const id = item.dataset.id;
        this.selectMovie(id);
      }
    });
  }

  // debounce func
  handleInput(e) {
    const query = e.target.value.trim();

    clearTimeout(this.debounceTimer);

    if (!query) {
      this.resultsList.innerHTML = "";
      this.results = [];
      this.setLoading(false);
      return;
    }


    this.debounceTimer = setTimeout(() => {
      this.performSearch(query);
    }, 300);
  }


    
    async performSearch(query) { // search not cachining properly 

        const cacheKey = query.trim().toLowerCase();

        if (this.cache.has(cacheKey)) {
            console.log('✅ CACHE HIT:', cacheKey);
    
            this.renderResults(this.cache.get(cacheKey), query);
            return; 
        }


        if (this.abortController) {
            this.abortController.abort();
        }


        this.abortController = new AbortController();
        const signal = this.abortController.signal;

        this.setLoading(true);
        this.updateStatus(`Searching for "${query}"...`);

        try {

            const url = `${this.baseUrl}/search/movie?api_key=${this.apiKey}&query=${encodeURIComponent(query)}&page=1`;
            
            const response = await fetch(url, { signal });
            
            if (!response.ok) throw new Error('API Error');
            
            const data = await response.json();
            const movies = data.results || [];


            this.cache.set(cacheKey, movies);
            
            this.renderResults(movies, query);
            this.updateStatus('');

        } catch (error) {
            if (error.name === 'AbortError') {
                console.log('Request cancelled (User typed faster)');
                return; 
            }
            console.error('Fetch failed:', error);
            this.updateStatus('Error fetching results.');
            this.resultsList.innerHTML = '<li class="empty-state">Failed to load results.</li>';
        } finally {
            if (this.abortController && !this.abortController.signal.aborted) {
                 this.setLoading(false);
            }
        }
    }

  // 
  renderResults(movies, query) {
    this.results = movies;
    this.activeIndex = -1;
    this.resultsList.innerHTML = ""; 

    if (movies.length === 0) {
      this.resultsList.innerHTML =
        '<li class="empty-state">No movies found.</li>';
      return;
    }

    const frag = new DocumentFragment();

    movies.forEach((movie, index) => {
      if (!this.template) return;

      const clone = this.template.content.cloneNode(true);
      const li = clone.querySelector(".movie-item");


      li.dataset.id = movie.id;
      li.dataset.index = index; // For keyboard nav

      const img = clone.querySelector(".movie-poster");

      if (movie.poster_path) {
      
        img.src = `https://image.tmdb.org/t/p/w92${movie.poster_path}`;
      } else {
    
        img.removeAttribute("src");
        img.classList.add("no-poster");
      }

      img.onerror = function () {
        this.removeAttribute("src");
        this.classList.add("no-poster");
      };
     
      const titleContainer = clone.querySelector(".title");
      titleContainer.appendChild(
        this.buildHighlightedTitle(movie.title, query),
      );

      const overview = clone.querySelector(".overview-preview");
      overview.textContent = movie.overview
        ? movie.overview.slice(0, 100) + "..."
        : "No overview available.";

      const date = clone.querySelector(".release-date");
      date.textContent = movie.release_date
        ? movie.release_date.split("-")[0]
        : "N/A";

      frag.appendChild(clone);
    });


    this.resultsList.appendChild(frag);
  }


  buildHighlightedTitle(title, query) {
    const container = document.createElement("span");
    if (!query) {
      container.textContent = title;
      return container;
    }

    const lowerTitle = title.toLowerCase();
    const lowerQuery = query.toLowerCase();
    const idx = lowerTitle.indexOf(lowerQuery);

    if (idx === -1) {
      container.textContent = title;
      return container;
    }

   
    const before = document.createTextNode(title.slice(0, idx));
    const matchText = title.slice(idx, idx + query.length);
    const after = document.createTextNode(title.slice(idx + query.length));


    const highlightSpan = document.createElement("span");
    highlightSpan.className = "highlight";
    highlightSpan.textContent = matchText; 

    container.appendChild(before);
    container.appendChild(highlightSpan);
    container.appendChild(after);

    return container;
  }


    handleKeydown(e) { // needs work doesnt scroll down only navifates the page 
        const items = this.resultsList.querySelectorAll('.movie-item');
        if (items.length === 0) return;

 
        if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault();
        }

        if (e.key === 'ArrowDown') {
      
            this.activeIndex = (this.activeIndex + 1) % items.length;
            this.focusItem(items);
        } else if (e.key === 'ArrowUp') {

            this.activeIndex = (this.activeIndex - 1 + items.length) % items.length;
            this.focusItem(items);
        } else if (e.key === 'Enter' && this.activeIndex !== -1) {
            e.preventDefault();

            items[this.activeIndex].click();
        }
    }

    focusItem(items) {
      
        items.forEach((item) => {
            item.classList.remove('active');
            item.setAttribute('aria-selected', 'false');

        });


        const targetItem = items[this.activeIndex];
        
        if (!targetItem) return;

   
        targetItem.classList.add('active');
        targetItem.setAttribute('aria-selected', 'true');
        targetItem.tabIndex = 0;

        const container = this.resultsList;
        const containerTop = container.scrollTop;
        const containerBottom = containerTop + container.clientHeight;
        const itemTop = targetItem.offsetTop;
        const itemBottom = itemTop + targetItem.offsetHeight;

        if (itemTop < containerTop) {
  
            container.scrollTo(0, itemTop);
        } else if (itemBottom > containerBottom) {

            container.scrollTo(0, itemBottom - container.clientHeight);
        }

        targetItem.focus({ preventScroll: true });
    }

  selectMovie(id) {
    this.detailPlaceholder.classList.add("hidden");
    this.detailContent.classList.remove("hidden");

    document.getElementById("detail-title").textContent = "Loading...";
    document.getElementById("cast-list").innerHTML = "";
    document.getElementById("video-list").innerHTML = "";

    this.loadMovieDetails(id);
  }


  async loadMovieDetails(id) {
    console.log(`Fetching details for ID: ${id}`);
 
    document.getElementById("detail-title").textContent = "Details Loading...";
  }

  // --- UTILS ---
  setLoading(isLoading) {
    this.container.setAttribute("data-loading", isLoading ? "true" : "false");
  }

  updateStatus(msg) {
    const el = this.container.querySelector(".status-message");
    if (el) el.textContent = msg;
  }
}
