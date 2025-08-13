#!/usr/bin/env node

/**
 * ManjiBot Startup Script
 * Handles setup and initialization
 */

const fs = require('fs');
const path = require('path');

// Check if config.env exists
const configPath = path.join(__dirname, 'config.env');
if (!fs.existsSync(configPath)) {
    console.log('⚠️  config.env not found!');
    console.log('📋 Copying from config.env.example...');
    
    const examplePath = path.join(__dirname, 'config.env.example');
    if (fs.existsSync(examplePath)) {
        fs.copyFileSync(examplePath, configPath);
        console.log('✅ config.env created!');
        console.log('📝 Please edit config.env with your settings and restart.');
        process.exit(0);
    } else {
        console.log('❌ config.env.example not found!');
        process.exit(1);
    }
}

// Create necessary directories
const dirs = ['temp', 'session', 'custom-plugins'];
dirs.forEach(dir => {
    const dirPath = path.join(__dirname, dir);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`📁 Created directory: ${dir}`);
    }
});

// Start the bot
require('./index.js');