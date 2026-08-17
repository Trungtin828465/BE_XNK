require('dotenv').config();

const express = require('express');
const appsScriptRoutes = require('./routes/appsScript.routes');

const app = express();
const port = process.env.PORT || 5000;

app.use(express.json());
app.use('/api', appsScriptRoutes);

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});
