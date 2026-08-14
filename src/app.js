const express = require('express');
const driveRoutes = require('./routes/drive.routes');

const app = express();

app.use(express.json());
app.use('/api', driveRoutes);

module.exports = app;
