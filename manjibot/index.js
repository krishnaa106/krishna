#!/usr/bin/env node

const { ManjiBot } = require('./lib/bot');

console.log(`
██╗   ██╗██╗███╗   ██╗███████╗███╗   ███╗ ██████╗ ██╗  ██╗███████╗
██║   ██║██║████╗  ██║██╔════╝████╗ ████║██╔═══██╗██║ ██╔╝██╔════╝
██║   ██║██║██╔██╗ ██║███████╗██╔████╔██║██║   ██║█████╔╝ █████╗  
╚██╗ ██╔╝██║██║╚██╗██║╚════██║██║╚██╔╝██║██║   ██║██╔═██╗ ██╔══╝  
 ╚████╔╝ ██║██║ ╚████║███████║██║ ╚═╝ ██║╚██████╔╝██║  ██╗███████╗
  ╚═══╝  ╚═╝╚═╝  ╚═══╝╚══════╝╚═╝     ╚═╝ ╚═════╝ ╚═╝  ╚═╝╚══════╝
                                                                    
                    🚀 VINSMOKE v1.0 - Ready to kick in!
`);

const bot = new ManjiBot();


const gracefulShutdown = async (signal) => {
    console.log(`\n🛑 Received ${signal}, shutting down gracefully...`);
    try {
        await bot.stop();
        console.log('✅ VINSMOKE stopped successfully');
        process.exit(0);
    } catch (error) {
        console.error('❌ Error during shutdown:', error);
        process.exit(1);
    }
};

// Handle shutdown signals
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGQUIT', () => gracefulShutdown('SIGQUIT'));

// Handle errors
process.on('uncaughtException', async (error) => {
    console.error('❌ Uncaught Exception:', error);
    try {
        await bot.stop();
    } catch (stopError) {
        console.error('❌ Error during emergency stop:', stopError);
    }
    process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
    console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
    try {
        await bot.stop();
    } catch (stopError) {
        console.error('❌ Error during emergency stop:', stopError);
    }
    process.exit(1);
});

// Start the bot
bot.start().catch(async (error) => {
    console.error('❌ Failed to start VINSMOKE:', error);
    try {
        await bot.stop();
    } catch (stopError) {
        console.error('❌ Error during emergency stop:', stopError);
    }
    process.exit(1);
});