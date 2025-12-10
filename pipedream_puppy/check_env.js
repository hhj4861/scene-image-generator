
try {
    const keys = Object.keys(process.env).filter(k => k.includes('KEY') || k.includes('TOKEN') || k.includes('CREDENTIAL'));
    console.log('Available Key/Credential Env Vars:', keys);

    if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
        console.log('GOOGLE_APPLICATION_CREDENTIALS found at path:', process.env.GOOGLE_APPLICATION_CREDENTIALS);
    } else {
        console.log('GOOGLE_APPLICATION_CREDENTIALS is NOT set.');
    }

    // Check for .env file usage
    try {
        const dotenv = require('dotenv');
        console.log('dotenv module is available.');
        // Try loading .env
        const result = dotenv.config();
        if (result.error) {
            console.log('dotenv.config() failed or no .env file found by dotenv');
        } else {
            console.log('.env file loaded successfully by dotenv.');
            const newKeys = Object.keys(result.parsed).filter(k => k.includes('KEY') || k.includes('TOKEN') || k.includes('CREDENTIAL'));
            console.log('Keys in .env:', newKeys);
        }
    } catch (e) {
        console.log('dotenv module not found or error loading it:', e.message);
    }

} catch (e) {
    console.error('Error in diagnostic script:', e);
}
