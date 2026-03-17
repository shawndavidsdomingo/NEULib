# **App Name**: NEU Library Terminal

## Core Features:

- Visitor Check-in Interface: Allows users to identify themselves via simulated RFID tap or institutional email login, view their basic profile, select their purpose of visit, and record their entry.
- Google Institutional Email Login: Secure user authentication using Google Sign-in, specifically tailored for institutional email domains.
- Simulated RFID Identity Verification: A mechanism to simulate RFID tag reads by inputting an ID string, performing a user lookup in Firestore to retrieve profile data and block status.
- Admin Dashboard - Real-time Overview: Displays key aggregate metrics like 'Total Visitors Today' and 'Total Visitors this Week' using real-time Firestore queries.
- Admin Dashboard - User Management: Provides a searchable list of all registered users with an interactive toggle button to update their 'isBlocked' status in Firestore.
- Admin Dashboard - Live Activity Feed: A dynamically scrolling list showcasing the 10 most recent visitor check-ins, including visitor name, purpose, and timestamp.
- Admin Dashboard - Analytical PDF Reports: Enables administrators to filter visit data by a custom date range and generate a downloadable PDF report including library header, total visits per college, and purpose of visit percentages.

## Style Guidelines:

- Color scheme: A dark theme, offering a modern, high-tech, and focused experience appropriate for a digital terminal.
- Primary color: A vibrant, clear spring green (#32CDA6) to denote activity, positive feedback, and key interactive elements, reflecting the library's contemporary digital services.
- Background color: A subtle, dark green-grey (#181D16) providing a deep, calming foundation that minimizes eye strain in varying light conditions.
- Accent color: A muted, light grey-green (#D1E8C9) for softer highlights, secondary information, and to ensure good contrast without overwhelming the primary color or dark background.
- Headlines font: 'Space Grotesk' (sans-serif) for its computerized and modern feel, perfect for a digital interface.
- Body font: 'Inter' (sans-serif) to ensure excellent readability for body text and longer descriptions, complementing the techy aesthetic of the headlines.
- Use clean, minimalist, line-art style icons with occasional flat fills, ensuring clarity and modern appeal.
- A structured and clean layout, utilizing card-based designs for logical grouping of information and interactive elements, enhancing hierarchy and ease of use.
- Subtle and fluid transitions for navigation and state changes, providing smooth user feedback and a polished feel without being distracting.