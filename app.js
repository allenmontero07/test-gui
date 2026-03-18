// app.js


const API_KEY = '16698f284799f226cd2eac22f03ecaa1'; 

document.addEventListener('DOMContentLoaded', () => {
 
    if (typeof SearchComponent === 'undefined') {
        console.error('SearchComponent class not found! Check if SearchComponent.js is linked in index.html.');
        return;
    }

    console.log('Initializing Cine-Search Pro...');
    
    const app = new SearchComponent(API_KEY, '.app-container');
    

    window.searchApp = app;
});