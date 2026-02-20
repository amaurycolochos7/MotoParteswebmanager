
const testLogin = async () => {
    try {
        const response = await fetch('http://localhost:3000/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                email: 'motobkaker',
                password: 'somepassword'
            })
        });

        console.log(`Status: ${response.status}`);
        const data = await response.json();
        console.log('Response:', data);
    } catch (error) {
        console.error('Error:', error);
    }
};

testLogin();
