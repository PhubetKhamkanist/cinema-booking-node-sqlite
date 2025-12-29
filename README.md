# 🎬 Cinema Ticket Reservation System
A full-stack web application for movie ticket booking built with Node.js, Express, and SQLite. This project demonstrates server-side rendering and local database management for a seamless user experience.

🚀 Features
Movie Browsing: View currently showing movies with details.
Seat Selection: Interactive seat selection for different showtimes.
Booking Management: Real-time ticket reservation stored in a local SQLite database.
Responsive Design: Using EJS for dynamic HTML rendering.

🛠️ Tech Stack
Frontend: EJS (Embedded JavaScript templates), CSS
Backend: Node.js, Express
Database: SQLite (Stored as Cinema_database.db)

📂 Project Structure
├── public/          # Static files (CSS, Images, Client-side JS)
├── views/           # EJS templates for dynamic pages
├── index.js         # Main server entry point
├── Cinema_database.db  # Local SQLite database file
├── package.json     # Project dependencies and scripts
└── README.md        # Project documentation


💾 Database Schema
The system uses SQLite to manage data. Below is the core logic used for the reservation system:
Movies Table: Stores titles, showtimes, and poster paths.
Seats Table: Tracks seat availability for each session.
Bookings Table: Links customers to their selected seats.

⚙️ How to Run
Clone the repository:

Bash
git clone https://github.com/YourUsername/cinema-booking-node-sqlite.git
Install dependencies (Requires Node.js):

Bash
npm install
Start the server:

Bash
node index.js
Open your browser and go to http://localhost:3000
