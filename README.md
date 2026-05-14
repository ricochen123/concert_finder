Concert Finder 
https://concert-finder-ebon.vercel.app/

Concert Finder is an app I built to discover live music near you. You can see upcoming shows pinned on a map, filter by genre, search by artist, and switch between a map view and a list view. All the concert data comes from Ticketmaster in real time.
I built this to practice working with real world APIs and get comfortable with React, TypeScript, and deploying a full project from scratch.

Tech Stack
React + TypeScript
Google Maps API
Ticketmaster Discovery API
Vite
Deployed on Vercel


To run it locally, you'll need a Google Maps API key and a Ticketmaster API key. Both are free to get.

bashgit clone https://github.com/ricochen123/concert_finder.git
cd concert_finder
npm install
cp env.example .env

Add your keys to the .env file then run:
bashnpm run dev

Environment Variables
VITE_GOOGLE_MAPS_API_KEY=your_key
VITE_TICKETMASTER_API_KEY=your_key
