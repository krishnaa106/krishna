#!/usr/bin/env node

/**
 * Simple test script for ManjiBot
 */

const fs = require('fs');
const path = require('path');

console.log('🧪 Testing ManjiBot components...\n');

// Test 1: Check if all required files exist
console.log('📁 Checking files...');
const requiredFiles = [
    'lib/bot.js',
    'lib/client.js',
    'lib/config.js',
    'lib/message.js',
    'lib/message-handler.js',
    'lib/plugin-manager.js',
    'lib/utils.js',
    'plugins/general.js',
    'plugins/sticker.js',
    'plugins/media.js',
    'plugins/admin.js',
    'config.env'
];

let allFilesExist = true;
requiredFiles.forEach(file => {
    if (fs.existsSync(path.join(__dirname, file))) {
        console.log(`  ✅ ${file}`);
    } else {
        console.log(`  ❌ ${file} - MISSING`);
        allFilesExist = false;
    }
});

if (!allFilesExist) {
    console.log('\n❌ Some required files are missing!');
    process.exit(1);
}

// Test 2: Check if modules can be loaded
console.log('\n📦 Testing module imports...');
try {
    const { Config } = require('./lib/config');
    console.log('  ✅ Config');
    
    const { PluginManager } = require('./lib/plugin-manager');
    console.log('  ✅ PluginManager');
    
    const { Message } = require('./lib/message');
    console.log('  ✅ Message');
    
    const { MessageHandler } = require('./lib/message-handler');
    console.log('  ✅ MessageHandler');
    
    const utils = require('./lib/utils');
    console.log('  ✅ Utils');
    
    const { ManjiBot } = require('./lib/bot');
    console.log('  ✅ ManjiBot');
    
} catch (error) {
    console.log(`  ❌ Module import error: ${error.message}`);
    process.exit(1);
}

// Test 3: Test plugin loading
console.log('\n🔌 Testing plugin loading...');
try {
    const { PluginManager } = require('./lib/plugin-manager');
    const pluginManager = new PluginManager();
    
    // Load plugins
    pluginManager.loadPlugins().then(() => {
        const commandCount = pluginManager.getCommandCount();
        const categories = pluginManager.getCategories();
        
        console.log(`  ✅ Loaded ${commandCount} commands`);
        console.log(`  ✅ Categories: ${categories.join(', ')}`);
        
        // Test 4: Test configuration
        console.log('\n⚙️  Testing configuration...');
        const { Config } = require('./lib/config');
        const config = new Config();
        
        console.log(`  ✅ Bot Name: ${config.BOT_NAME}`);
        console.log(`  ✅ Prefix: ${config.PREFIX}`);
        console.log(`  ✅ Mode: ${config.BOT_MODE}`);
        
        console.log('\n🎉 All tests passed! ManjiBot is ready to run.');
        console.log('\n🚀 To start the bot, run: npm start');
        
    }).catch(error => {
        console.log(`  ❌ Plugin loading error: ${error.message}`);
        process.exit(1);
    });
    
} catch (error) {
    console.log(`  ❌ Plugin test error: ${error.message}`);
    process.exit(1);
}