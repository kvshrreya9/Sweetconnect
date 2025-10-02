// API base URL
const API_BASE = 'http://localhost:5000/api';

// DOM Elements
const loginSection = document.getElementById('loginSection');
const dashboard = document.getElementById('dashboard');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const userOptions = document.querySelectorAll('.user-option');
const welcomeUser = document.getElementById('welcomeUser');
const userRole = document.getElementById('userRole');
const adminPanel = document.getElementById('adminPanel');
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendMessageBtn = document.getElementById('sendMessageBtn');
const notification = document.getElementById('notification');
const notificationText = document.getElementById('notificationText');
const nameGroup = document.getElementById('nameGroup');
const featureModal = document.getElementById('featureModal');
const modalTitle = document.getElementById('modalTitle');
const modalPrompt = document.getElementById('modalPrompt');
const modalInput = document.getElementById('modalInput');
const modalSubmit = document.getElementById('modalSubmit');
const modalCancel = document.getElementById('modalCancel');

// Global variables
let currentUser = null;
let socket = null;
let currentFeature = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    // Check if user is already logged in
    const token = localStorage.getItem('token');
    if (token) {
        // Verify token and load user data
        verifyTokenAndLoadUser(token);
    }
    
    // Set up event listeners
    setupEventListeners();
});

// Set up all event listeners
function setupEventListeners() {
    // User type selection
    userOptions.forEach(option => {
        option.addEventListener('click', function() {
            userOptions.forEach(opt => opt.classList.remove('active'));
            this.classList.add('active');
            
            // Show name field for shared users on first registration
            if (this.dataset.type === 'shared') {
                nameGroup.style.display = 'block';
            } else {
                nameGroup.style.display = 'none';
            }
        });
    });
    
    // Login button
    loginBtn.addEventListener('click', handleLogin);
    
    // Logout button
    logoutBtn.addEventListener('click', handleLogout);
    
    // Send message button
    sendMessageBtn.addEventListener('click', sendMessage);
    
    // Enter key to send message
    messageInput.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            sendMessage();
        }
    });
    
    // Feature cards click events
    document.getElementById('sweetTasks').addEventListener('click', function() {
        if (currentUser && currentUser.role !== 'admin') {
            openFeatureModal('Sweetly Tasks', 'What sweet task would you like to order?', 'sweet_task');
        }
    });
    
    document.getElementById('angerExplaining').addEventListener('click', function() {
        if (currentUser && currentUser.role !== 'admin') {
            openFeatureModal('Anger Explaining', 'What is making you feel angry?', 'anger_explaining');
        }
    });
    
    document.getElementById('anyIssues').addEventListener('click', function() {
        if (currentUser && currentUser.role !== 'admin') {
            openFeatureModal('Any Issues with UR\'s', 'What relationship issue would you like to discuss?', 'relationship_issue');
        }
    });
    
    // Modal buttons
    modalSubmit.addEventListener('click', submitFeatureInput);
    modalCancel.addEventListener('click', closeFeatureModal);
    
    // Admin panel buttons
    document.getElementById('addFeatureBtn')?.addEventListener('click', addNewFeature);
    document.getElementById('viewUsersBtn')?.addEventListener('click', viewUsers);
    document.getElementById('updateThemeBtn')?.addEventListener('click', updateTheme);
    document.getElementById('backupDataBtn')?.addEventListener('click', backupData);
    
    // Close modal when clicking outside
    featureModal.addEventListener('click', function(e) {
        if (e.target === featureModal) {
            closeFeatureModal();
        }
    });
}

// Verify token and load user data
async function verifyTokenAndLoadUser(token) {
    try {
        const response = await fetch(`${API_BASE}/profile`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            currentUser = data.user;
            initializeDashboard();
            connectToSocket();
            loadMessageHistory();
        } else {
            // Token is invalid, remove it
            localStorage.removeItem('token');
            showNotification('Session expired. Please login again.', 'error');
        }
    } catch (error) {
        console.error('Error verifying token:', error);
        localStorage.removeItem('token');
        showNotification('Connection error. Please try again.', 'error');
    }
}

// Handle login/registration
async function handleLogin() {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    const name = document.getElementById('name').value;
    const selectedType = document.querySelector('.user-option.active').dataset.type;
    
    // Validate inputs
    if (!email || !password) {
        showNotification('Please enter both email and password', 'error');
        return;
    }
    
    // For shared users, require name on first registration
    if (selectedType === 'shared' && !name) {
        showNotification('Please enter your name for registration', 'error');
        return;
    }
    
    try {
        let response;
        let isNewUser = false;
        
        // For admin and Shrreya, try login first
        if (selectedType !== 'shared') {
            response = await fetch(`${API_BASE}/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ email, password })
            });
        }
        
        // If login failed or it's a shared user, try registration
        if (selectedType === 'shared' || !response.ok) {
            const role = selectedType === 'shared' ? 'shared' : 
                        selectedType === 'admin' ? 'admin' : 'shrreya';
            
            response = await fetch(`${API_BASE}/register`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ 
                    email, 
                    password, 
                    name: name || email.split('@')[0],
                    role 
                })
            });
            isNewUser = true;
        }
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Login failed');
        }
        
        const data = await response.json();
        
        // Store token and user data
        localStorage.setItem('token', data.token);
        currentUser = data.user;
        
        // Show success message with email notification info
        if (isNewUser) {
            showNotification(`Account created successfully! Welcome email sent to ${email}`, 'success');
        } else {
            showNotification(`Login successful! Login alert sent to ${email}`, 'success');
        }
        
        // Initialize dashboard
        initializeDashboard();
        connectToSocket();
        loadMessageHistory();
        
    } catch (error) {
        console.error('Login error:', error);
        showNotification(error.message || 'Login failed. Please try again.', 'error');
    }
}

// Initialize dashboard after login
function initializeDashboard() {
    // Switch to dashboard view
    loginSection.style.display = 'none';
    dashboard.style.display = 'flex';
    
    // Update user info with Tharun for shared users
    welcomeUser.textContent = `Welcome, ${currentUser.name || currentUser.email}!`;
    
    // Display Tharun instead of Shared User
    if (currentUser.role === 'shared') {
        userRole.textContent = 'Role: Tharun';
    } else {
        userRole.textContent = `Role: ${currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1)}`;
    }
    
    // Show/hide admin panel based on role
    if (currentUser.role === 'admin') {
        adminPanel.style.display = 'block';
    } else {
        adminPanel.style.display = 'none';
    }
    
    // Clear login form
    document.getElementById('email').value = '';
    document.getElementById('password').value = '';
    document.getElementById('name').value = '';
}

// Connect to Socket.io for real-time communication - FIXED VERSION
function connectToSocket() {
    try {
        // Connect to Socket.io server with error handling
        socket = io('http://localhost:5000', {
            transports: ['websocket', 'polling']
        });
        
        socket.on('connect', () => {
            console.log('✅ Connected to server via Socket.io');
            document.getElementById('onlineStatus').innerHTML = '<i class="fas fa-circle" style="color: #4CAF50;"></i> Shrreya is online';
            
            if (currentUser) {
                socket.emit('join', currentUser.id);
            }
        });
        
        // Listen for new messages
        socket.on('newMessage', (message) => {
            console.log('New message received:', message);
            // Only show messages meant for current user or from current user
            if (message.sender_id === currentUser.id || currentUser.role === 'shrreya' || currentUser.role === 'shared') {
                addMessageToChat(message, message.sender_id === currentUser.id ? 'sent' : 'received');
            }
        });
        
        socket.on('disconnect', () => {
            console.log('❌ Disconnected from server');
            document.getElementById('onlineStatus').innerHTML = '<i class="fas fa-circle" style="color: #EF5B5B;"></i> Shrreya is offline';
        });
        
        socket.on('connect_error', (error) => {
            console.error('Socket.io connection error:', error);
            document.getElementById('onlineStatus').innerHTML = '<i class="fas fa-circle" style="color: #FF9800;"></i> Connection issues';
        });
        
    } catch (error) {
        console.error('Error setting up Socket.io:', error);
        showNotification('Real-time features unavailable', 'error');
    }
}

// Load message history
async function loadMessageHistory() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE}/messages`, {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const data = await response.json();
            displayMessageHistory(data.messages);
        }
    } catch (error) {
        console.error('Error loading messages:', error);
    }
}

// Display message history
function displayMessageHistory(messages) {
    // Clear existing messages (except the welcome message)
    const welcomeMessage = chatMessages.querySelector('.message.received');
    chatMessages.innerHTML = '';
    if (welcomeMessage) {
        chatMessages.appendChild(welcomeMessage);
    }
    
    // Add messages from history
    messages.reverse().forEach(message => {
        const isSent = message.sender_id === currentUser.id;
        addMessageToChat(message, isSent ? 'sent' : 'received');
    });
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Send message
async function sendMessage() {
    const messageText = messageInput.value.trim();
    
    if (!messageText) {
        showNotification('Please enter a message', 'error');
        return;
    }
    
    if (!currentUser) {
        showNotification('Please login first', 'error');
        return;
    }
    
    try {
        const token = localStorage.getItem('token');
        const response = await fetch(`${API_BASE}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                content: messageText,
                type: 'message'
            })
        });
        
        if (response.ok) {
            const result = await response.json();
            messageInput.value = '';
            
            // Add message to UI immediately for better UX
            const tempMessage = {
                id: 'temp-' + Date.now(),
                sender_id: currentUser.id,
                content: messageText,
                created_at: new Date().toISOString(),
                sender_name: currentUser.name
            };
            addMessageToChat(tempMessage, 'sent');
            
            // Show notification about email sent
            if (currentUser.role === 'shared') {
                showNotification('Message sent to Shrreya! Email notifications sent to both of you.', 'success');
            } else if (currentUser.role === 'shrreya') {
                showNotification('Message sent to Tharun! Email notifications sent to both of you.', 'success');
            } else {
                showNotification('Message sent! Email notifications delivered.', 'success');
            }
            
        } else {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to send message');
        }
    } catch (error) {
        console.error('Error sending message:', error);
        showNotification('Failed to send message. Please try again.', 'error');
    }
}

// Add message to chat UI
function addMessageToChat(message, type) {
    const messageElement = document.createElement('div');
    messageElement.className = `message ${type}`;
    
    const messageTime = new Date(message.created_at).toLocaleTimeString([], { 
        hour: '2-digit', minute: '2-digit' 
    });
    
    // Use appropriate name based on role
    let displayName = message.sender_name || 'User';
    if (displayName === 'shared') {
        displayName = 'Tharun';
    }
    
    messageElement.innerHTML = `
        <p>${message.content}</p>
        <div class="message-time">${displayName}, ${messageTime}</div>
    `;
    
    chatMessages.appendChild(messageElement);
    
    // Scroll to bottom
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Open feature modal
function openFeatureModal(title, prompt, featureType) {
    currentFeature = featureType;
    modalTitle.textContent = title;
    modalPrompt.textContent = prompt;
    modalInput.value = '';
    featureModal.style.display = 'flex';
    modalInput.focus();
}

// Close feature modal
function closeFeatureModal() {
    featureModal.style.display = 'none';
    currentFeature = null;
}

// Submit feature input
async function submitFeatureInput() {
    const inputText = modalInput.value.trim();
    
    if (!inputText) {
        showNotification('Please enter your response', 'error');
        return;
    }
    
    try {
        const token = localStorage.getItem('token');
        
        // Log the activity
        const response = await fetch(`${API_BASE}/activities`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                activity_type: currentFeature,
                details: inputText
            })
        });
        
        if (response.ok) {
            showNotification(`Your ${modalTitle.textContent.toLowerCase()} has been sent! Email notification sent to ${currentUser.email}`, 'success');
            closeFeatureModal();
        } else {
            throw new Error('Failed to submit');
        }
    } catch (error) {
        console.error('Error submitting feature:', error);
        showNotification('Failed to submit. Please try again.', 'error');
    }
}

// Handle logout
function handleLogout() {
    // Disconnect socket
    if (socket) {
        socket.disconnect();
    }
    
    // Clear user data
    currentUser = null;
    localStorage.removeItem('token');
    
    // Switch to login section
    dashboard.style.display = 'none';
    loginSection.style.display = 'flex';
    
    // Reset UI
    chatMessages.innerHTML = `
        <div class="message received">
            <p>Hello! How can I help you today?</p>
            <div class="message-time">Shrreya, <span class="time">${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span></div>
        </div>
    `;
    
    showNotification('You have been logged out', 'info');
}

// Admin functions
async function addNewFeature() {
    const featureName = document.getElementById('newFeatureName').value;
    const featureDesc = document.getElementById('newFeatureDesc').value;
    
    if (!featureName) {
        showNotification('Please enter a feature name', 'error');
        return;
    }
    
    // Simulate adding feature (in real app, this would call an API)
    showNotification(`Feature "${featureName}" added successfully!`, 'success');
    document.getElementById('newFeatureName').value = '';
    document.getElementById('newFeatureDesc').value = '';
}

function viewUsers() {
    showNotification('User management feature would open here', 'info');
}

function updateTheme() {
    showNotification('Theme update feature would open here', 'info');
}

function backupData() {
    showNotification('Data backup initiated successfully!', 'success');
}

// Show notification
function showNotification(message, type) {
    notificationText.textContent = message;
    
    // Set color based on type
    if (type === 'error') {
        notification.style.backgroundColor = '#EF5B5B';
    } else if (type === 'success') {
        notification.style.backgroundColor = '#4CAF50';
    } else {
        notification.style.backgroundColor = '#FF9E64';
    }
    
    notification.style.display = 'block';
    
    // Hide after 5 seconds for email notifications
    setTimeout(() => {
        notification.style.display = 'none';
    }, 5000);
}

// Handle page refresh
window.addEventListener('beforeunload', function() {
    if (socket) {
        socket.disconnect();
    }
});

// Auto-focus message input when chat is active
function focusMessageInput() {
    if (messageInput) {
        messageInput.focus();
    }
}