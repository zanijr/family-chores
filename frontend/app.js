// Family Chores App - Main JavaScript Application
function familyChoresApp() {
    return {
        // State
        loading: true,
        isAuthenticated: false,
        user: null,
        token: null,
        activeTab: 'dashboard',

        // Login state
        loginStep: 'family', // 'family' or 'user'
        familyCode: '',
        familyInfo: null,
        familyMembers: [],
        loginLoading: false,

        // Registration state
        showRegisterFamily: false,
        registerForm: {
            name: '',
            admin_email: '',
            admin_password: ''
        },
        registerLoading: false,

        // User registration state
        showRegisterUser: false,
        registerUserForm: {
            name: '',
            email: '',
            password: '',
            role: 'child'
        },
        registerUserLoading: false,

        // Login form
        loginForm: {
            email: '',
            password: ''
        },

        // Data
        currentChores: [],
        allChores: [],
        recentTasks: [],
        recurringChores: [],

        // Modals
        showSubmitModal: false,
        selectedChore: null,
        submitForm: {
            notes: '',
            photo: null
        },
        submitLoading: false,

        showAddMemberModal: false,
        newMember: {
            name: '',
            role: 'child',
            email: ''
        },
        addMemberLoading: false,

        // Create chore
        newChore: {
            title: '',
            description: '',
            reward_type: 'money',
            reward_amount: '',
            requires_photo: false,
            acceptance_timer: 5,
            auto_assign: false,
            assigned_to: null,
            rotation_type: 'none',
            rotation_members: [],
            priority: 'medium',
            estimated_duration: null,
            difficulty_level: 'medium',
            category: null
        },
        createChoreLoading: false,
        
        // Recurring chore
        newRecurringChore: {
            title: '',
            description: '',
            reward_type: 'money',
            reward_amount: '',
            requires_photo: false,
            frequency: 'weekly',
            day_of_week: 'monday',
            day_of_month: 1,
            start_date: new Date().toISOString().split('T')[0],
            auto_assign: false,
            assigned_to: null,
            rotation_type: 'none',
            rotation_members: []
        },
        createRecurringLoading: false,
        showRecurringModal: false,

        // Notifications
        notification: {
            show: false,
            type: 'info',
            title: '',
            message: ''
        },

        // Dark Mode
        isDarkMode: false,

        // API Base URL
        get apiUrl() {
            return '/api';
        },

        // Initialize app
        async init() {
            console.log('Initializing Family Chores App...');
            
            // Initialize dark mode
            this.initTheme();
            
            // Check for existing token
            const savedToken = localStorage.getItem('family_chores_token');
            if (savedToken) {
                this.token = savedToken;
                try {
                    await this.verifyToken();
                } catch (error) {
                    console.error('Token verification failed:', error);
                    this.logout();
                }
            }
            
            this.loading = false;
        },

        // API Helper
        async apiCall(endpoint, options = {}) {
            const url = `${this.apiUrl}${endpoint}`;
            const config = {
                headers: {
                    'Content-Type': 'application/json',
                    ...options.headers
                },
                ...options
            };

            if (this.token && !config.headers.Authorization) {
                config.headers.Authorization = `Bearer ${this.token}`;
            }

            try {
                const response = await fetch(url, config);
                
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({}));
                    throw new Error(errorData.message || `HTTP ${response.status}`);
                }
                
                return response.json();
            } catch (error) {
                console.error('API Error:', error);
                throw error;
            }
        },

        // Authentication
        async verifyToken() {
            try {
                const data = await this.apiCall('/auth/verify');
                if (data.valid && data.user) {
                    this.user = data.user;
                    this.isAuthenticated = true;
                    await this.loadDashboardData();
                } else {
                    throw new Error('Invalid token');
                }
            } catch (error) {
                this.logout();
                throw error;
            }
        },

        async loginWithFamilyCode() {
            if (!this.familyCode.trim()) return;
            
            this.loginLoading = true;
            try {
                const data = await this.apiCall('/auth/check-family-code', {
                    method: 'POST',
                    body: JSON.stringify({ familyCode: this.familyCode.toUpperCase() })
                });

                if (data.data.exists) {
                    this.familyInfo = data.data.family;
                    this.loginStep = 'user';
                    this.showNotification('success', 'Family Found', `Connected to ${data.data.family.name}`);
                } else {
                    this.showNotification('error', 'Family Not Found', 'Invalid family code');
                }
            } catch (error) {
                this.showNotification('error', 'Login Failed', error.message);
            } finally {
                this.loginLoading = false;
            }
        },

        async loginWithPassword() {
            if (!this.loginForm.email || !this.loginForm.password) {
                this.showNotification('error', 'Missing Information', 'Please enter both email and password');
                return;
            }
            
            this.loginLoading = true;
            try {
                const data = await this.apiCall('/auth/login', {
                    method: 'POST',
                    body: JSON.stringify({
                        familyCode: this.familyCode.toUpperCase(),
                        email: this.loginForm.email,
                        password: this.loginForm.password
                    })
                });

                this.token = data.token;
                this.user = data.data.user;
                this.isAuthenticated = true;
                localStorage.setItem('family_chores_token', this.token);
                
                await this.loadDashboardData();
                this.showNotification('success', 'Welcome!', `Logged in as ${data.data.user.name}`);
            } catch (error) {
                this.showNotification('error', 'Login Failed', error.message);
            } finally {
                this.loginLoading = false;
            }
        },

        goBackToFamilyLogin() {
            this.loginStep = 'family';
            this.familyInfo = null;
            this.familyMembers = [];
        },

        async registerFamily() {
            if (!this.registerForm.name || !this.registerForm.admin_email || !this.registerForm.admin_password) return;
            
            this.registerLoading = true;
            try {
                const data = await this.apiCall('/auth/register', {
                    method: 'POST',
                    body: JSON.stringify({
                        familyName: this.registerForm.name,
                        adminName: 'Admin', // Default admin name
                        adminEmail: this.registerForm.admin_email,
                        adminPassword: this.registerForm.admin_password
                    })
                });

                this.token = data.token;
                this.user = data.data.user;
                this.isAuthenticated = true;
                localStorage.setItem('family_chores_token', this.token);
                
                await this.loadDashboardData();
                this.showNotification('success', 'Family Registered!', `Welcome to your new family! Your family code is: ${data.data.user.family_code}`);
                this.showRegisterFamily = false;
                this.registerForm = { name: '', admin_email: '', admin_password: '' };
            } catch (error) {
                this.showNotification('error', 'Registration Failed', error.message);
            } finally {
                this.registerLoading = false;
            }
        },

        async registerUser() {
            if (!this.registerUserForm.name || !this.registerUserForm.email || !this.registerUserForm.password) return;
            
            this.registerUserLoading = true;
            try {
                const data = await this.apiCall('/auth/register-user', {
                    method: 'POST',
                    body: JSON.stringify({
                        familyCode: this.familyCode.toUpperCase(),
                        name: this.registerUserForm.name,
                        email: this.registerUserForm.email,
                        password: this.registerUserForm.password,
                        role: this.registerUserForm.role
                    })
                });

                this.token = data.token;
                this.user = data.data.user;
                this.isAuthenticated = true;
                localStorage.setItem('family_chores_token', this.token);
                
                await this.loadDashboardData();
                this.showNotification('success', 'Account Created!', `Welcome to the family, ${data.data.user.name}!`);
                this.showRegisterUser = false;
                this.registerUserForm = { name: '', email: '', password: '', role: 'child' };
            } catch (error) {
                this.showNotification('error', 'Registration Failed', error.message);
            } finally {
                this.registerUserLoading = false;
            }
        },

        logout() {
            this.token = null;
            this.user = null;
            this.isAuthenticated = false;
            this.activeTab = 'dashboard';
            this.loginStep = 'family';
            this.familyCode = '';
            this.familyInfo = null;
            this.familyMembers = [];
            this.currentChores = [];
            this.allChores = [];
            this.recentTasks = [];
            localStorage.removeItem('family_chores_token');
            this.showNotification('info', 'Logged Out', 'You have been logged out successfully');
        },

        // Data Loading
        async loadDashboardData() {
            try {
                await Promise.all([
                    this.loadCurrentChores(),
                    this.loadAllChores(),
                    this.loadRecentTasks(),
                    this.loadFamilyMembers(),
                    this.loadRecurringChores()
                ]);
            } catch (error) {
                console.error('Error loading dashboard data:', error);
                this.showNotification('error', 'Loading Error', 'Failed to load some data');
            }
        },
        
        async loadRecurringChores() {
            try {
                const data = await this.apiCall('/recurring');
                this.recurringChores = data.data.recurringChores;
                console.log('Recurring chores loaded:', this.recurringChores);
            } catch (error) {
                console.error('Error loading recurring chores:', error);
            }
        },

        async loadCurrentChores() {
            try {
                const data = await this.apiCall('/users/me/chores');
                this.currentChores = data.chores.filter(chore => 
                    ['pending_acceptance', 'in_progress', 'auto_accepted', 'pending_approval'].includes(chore.status)
                );
                console.log('Current chores loaded:', this.currentChores);
            } catch (error) {
                console.error('Error loading current chores:', error);
            }
        },

        async loadAllChores() {
            try {
                const data = await this.apiCall('/chores');
                this.allChores = data.chores;
                console.log('All chores loaded:', this.allChores);
            } catch (error) {
                console.error('Error loading all chores:', error);
            }
        },

        async loadRecentTasks() {
            try {
                const data = await this.apiCall('/users/profile');
                this.recentTasks = data.completed_tasks || [];
                console.log('Recent tasks loaded:', this.recentTasks);
                
                // Update user earnings if available
                if (data.user) {
                    this.user.earnings = data.user.earnings;
                }
            } catch (error) {
                console.error('Error loading recent tasks:', error);
            }
        },

        async loadFamilyMembers() {
            try {
                const data = await this.apiCall('/users/family/members');
                this.familyMembers = data.members.sort((a, b) => {
                    // Sort by earnings (highest first) for leaderboard
                    return parseFloat(b.earnings || 0) - parseFloat(a.earnings || 0);
                });
                console.log('Family members loaded:', this.familyMembers);
            } catch (error) {
                console.error('Error loading family members:', error);
            }
        },

        async refreshData() {
            await this.loadDashboardData();
            this.showNotification('success', 'Refreshed', 'Data has been updated');
        },

        // Chore Actions
        async acceptChore(choreId) {
            try {
                console.log('Accepting chore:', choreId);
                await this.apiCall(`/chores/${choreId}/accept`, { method: 'POST' });
                await this.loadCurrentChores();
                await this.loadAllChores();
                this.showNotification('success', 'Chore Accepted', 'You can now start working on this chore');
            } catch (error) {
                this.showNotification('error', 'Accept Failed', error.message);
            }
        },

        async declineChore(choreId) {
            try {
                console.log('Declining chore:', choreId);
                await this.apiCall(`/chores/${choreId}/decline`, { method: 'POST' });
                await this.loadCurrentChores();
                await this.loadAllChores();
                this.showNotification('info', 'Chore Declined', 'Chore has been passed to the next child');
            } catch (error) {
                this.showNotification('error', 'Decline Failed', error.message);
            }
        },

        async assignChore(choreId) {
            try {
                console.log('Assigning chore:', choreId);
                // Get child users to assign to
                const childUsers = this.familyMembers.filter(member => member.role === 'child');
                if (childUsers.length === 0) {
                    this.showNotification('error', 'No Children', 'There are no children in the family to assign chores to');
                    return;
                }
                
                // For simplicity, assign to the first child
                const userId = childUsers[0].id;
                
                const data = await this.apiCall(`/chores/${choreId}/assign`, { 
                    method: 'POST',
                    body: JSON.stringify({ userId })
                });
                
                await this.loadAllChores();
                this.showNotification('success', 'Chore Assigned', `Chore assigned to ${data.data.assigned_to}`);
            } catch (error) {
                this.showNotification('error', 'Assignment Failed', error.message);
            }
        },

        // Submit Chore Modal
        openSubmitModal(chore) {
            console.log('Opening submit modal for chore:', chore);
            this.selectedChore = chore;
            this.submitForm = { notes: '', photo: null };
            this.showSubmitModal = true;
        },

        closeSubmitModal() {
            this.showSubmitModal = false;
            this.selectedChore = null;
            this.submitForm = { notes: '', photo: null };
        },

        handlePhotoUpload(event) {
            const file = event.target.files[0];
            if (file) {
                console.log('Photo selected:', file.name);
                this.submitForm.photo = file;
            }
        },

        async submitChore() {
            if (!this.selectedChore) return;
            
            this.submitLoading = true;
            try {
                console.log('Submitting chore:', this.selectedChore.id);
                const formData = new FormData();
                formData.append('notes', this.submitForm.notes);
                if (this.submitForm.photo) {
                    formData.append('photo', this.submitForm.photo);
                }

                await this.apiCall(`/chores/${this.selectedChore.id}/submit`, {
                    method: 'POST',
                    headers: {
                        // Remove Content-Type to let browser set it with boundary for FormData
                        Authorization: `Bearer ${this.token}`
                    },
                    body: formData
                });

                await this.loadCurrentChores();
                await this.loadAllChores();
                this.closeSubmitModal();
                this.showNotification('success', 'Chore Submitted', 'Your chore has been submitted for approval');
            } catch (error) {
                this.showNotification('error', 'Submission Failed', error.message);
            } finally {
                this.submitLoading = false;
            }
        },

        // Create Chore
        async createChore() {
            if (!this.newChore.title || !this.newChore.reward_amount) {
                this.showNotification('error', 'Missing Information', 'Please enter a title and reward amount');
                return;
            }
            
            this.createChoreLoading = true;
            try {
                console.log('Creating chore:', this.newChore);

                // Prepare rotation members if needed (send IDs)
                let rotationMembers = null;
                if (this.newChore.rotation_type !== 'none') {
                    rotationMembers = this.newChore.rotation_members && this.newChore.rotation_members.length
                        ? this.newChore.rotation_members
                        : this.familyMembers.filter(member => member.role === 'child').map(m => m.id);
                }

                const payload = {
                    title: this.newChore.title,
                    description: this.newChore.description,
                    reward_type: this.newChore.reward_type,
                    reward_amount: this.newChore.reward_amount,
                    requires_photo: this.newChore.requires_photo,
                    acceptance_timer: this.newChore.acceptance_timer,
                    auto_assign: this.newChore.auto_assign,
                    assigned_to: this.newChore.assigned_to || null,
                    rotation_type: this.newChore.rotation_type,
                    rotation_members: rotationMembers,
                    priority: this.newChore.priority,
                    estimated_duration: this.newChore.estimated_duration,
                    difficulty_level: this.newChore.difficulty_level,
                    category: this.newChore.category
                };

                await this.apiCall('/chores', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });

                await this.loadAllChores();
                // Reset newChore to defaults
                this.newChore = {
                    title: '',
                    description: '',
                    reward_type: 'money',
                    reward_amount: '',
                    requires_photo: false,
                    acceptance_timer: 5,
                    auto_assign: false,
                    assigned_to: null,
                    rotation_type: 'none',
                    rotation_members: [],
                    priority: 'medium',
                    estimated_duration: null,
                    difficulty_level: 'medium',
                    category: null
                };
                this.showNotification('success', 'Chore Created', 'New chore has been created successfully');
            } catch (error) {
                this.showNotification('error', 'Creation Failed', error.message);
            } finally {
                this.createChoreLoading = false;
            }
        },
        
        // Recurring Chores
        openRecurringModal() {
            this.showRecurringModal = true;
            // Set default start date to today
            this.newRecurringChore.start_date = new Date().toISOString().split('T')[0];
        },
        
        closeRecurringModal() {
            this.showRecurringModal = false;
        },
        
        async createRecurringChore() {
            if (!this.newRecurringChore.title || !this.newRecurringChore.reward_amount || !this.newRecurringChore.frequency) {
                this.showNotification('error', 'Missing Information', 'Please enter title, reward amount, and frequency');
                return;
            }
            
            this.createRecurringLoading = true;
            try {
                console.log('Creating recurring chore:', this.newRecurringChore);
                
                // Prepare rotation members if needed
                let rotationMembers = null;
                if (this.newRecurringChore.rotation_type !== 'none') {
                    rotationMembers = this.familyMembers
                        .filter(member => member.role === 'child')
                        .map(member => member.id);
                }
                
                const payload = {
                    ...this.newRecurringChore,
                    rotation_members: rotationMembers
                };
                
                await this.apiCall('/recurring', {
                    method: 'POST',
                    body: JSON.stringify(payload)
                });

                await this.loadRecurringChores();
                this.newRecurringChore = {
                    title: '',
                    description: '',
                    reward_type: 'money',
                    reward_amount: '',
                    requires_photo: false,
                    frequency: 'weekly',
                    day_of_week: 'monday',
                    day_of_month: 1,
                    start_date: new Date().toISOString().split('T')[0],
                    auto_assign: false,
                    assigned_to: null,
                    rotation_type: 'none',
                    rotation_members: []
                };
                this.closeRecurringModal();
                this.showNotification('success', 'Recurring Chore Created', 'New recurring chore has been created successfully');
            } catch (error) {
                this.showNotification('error', 'Creation Failed', error.message);
            } finally {
                this.createRecurringLoading = false;
            }
        },
        
        async generateChoresFromRecurring(recurringId) {
            try {
                console.log('Generating chores from recurring template:', recurringId);
                const data = await this.apiCall('/recurring/generate', {
                    method: 'POST',
                    body: JSON.stringify({ recurringId })
                });
                
                await this.loadAllChores();
                await this.loadRecurringChores();
                this.showNotification('success', 'Chores Generated', `Generated ${data.data.generated} chores from recurring template`);
            } catch (error) {
                this.showNotification('error', 'Generation Failed', error.message);
            }
        },

        // Family Management
        async addFamilyMember() {
            if (!this.newMember.name || !this.newMember.role) {
                this.showNotification('error', 'Missing Information', 'Please enter a name and select a role');
                return;
            }
            
            this.addMemberLoading = true;
            try {
                console.log('Adding family member:', this.newMember);
                await this.apiCall(`/families/${this.user.family_id}/members`, {
                    method: 'POST',
                    body: JSON.stringify(this.newMember)
                });

                await this.loadFamilyMembers();
                this.newMember = { name: '', role: 'child', email: '' };
                this.showAddMemberModal = false;
                this.showNotification('success', 'Member Added', 'New family member has been added successfully');
            } catch (error) {
                this.showNotification('error', 'Add Failed', error.message);
            } finally {
                this.addMemberLoading = false;
            }
        },

        // Approve/Reject Chore
        async approveChore(choreId) {
            try {
                console.log('Approving chore:', choreId);
                await this.apiCall(`/chores/${choreId}/approve`, { method: 'POST' });
                await this.loadAllChores();
                await this.loadFamilyMembers();
                await this.loadRecentTasks();
                this.showNotification('success', 'Chore Approved', 'Chore has been approved and reward awarded');
            } catch (error) {
                this.showNotification('error', 'Approval Failed', error.message);
            }
        },

        async rejectChore(choreId) {
            try {
                console.log('Rejecting chore:', choreId);
                const feedback = prompt('Please provide feedback for rejection:');
                if (feedback === null) return; // User cancelled
                
                await this.apiCall(`/chores/${choreId}/reject`, { 
                    method: 'POST',
                    body: JSON.stringify({ feedback })
                });
                
                await this.loadAllChores();
                this.showNotification('info', 'Chore Rejected', 'Chore has been rejected and returned to in-progress');
            } catch (error) {
                this.showNotification('error', 'Rejection Failed', error.message);
            }
        },

        // Notifications
        showNotification(type, title, message) {
            this.notification = {
                show: true,
                type,
                title,
                message
            };

            // Auto-hide after 5 seconds
            setTimeout(() => {
                this.hideNotification();
            }, 5000);
        },

        hideNotification() {
            this.notification.show = false;
        },

        // Utilities
        formatDate(dateString) {
            const date = new Date(dateString);
            const now = new Date();
            const diffTime = Math.abs(now - date);
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

            if (diffDays === 1) {
                return 'Yesterday';
            } else if (diffDays < 7) {
                return `${diffDays} days ago`;
            } else {
                return date.toLocaleDateString();
            }
        },

        formatCurrency(amount) {
            return parseFloat(amount || 0).toFixed(2);
        },

        // Dark Mode Management
        initTheme() {
            // Check for saved theme preference or default to system preference
            const savedTheme = localStorage.getItem('family_chores_theme');
            const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            
            if (savedTheme === 'dark' || (!savedTheme && systemPrefersDark)) {
                this.isDarkMode = true;
                document.documentElement.setAttribute('data-theme', 'dark');
            } else {
                this.isDarkMode = false;
                document.documentElement.removeAttribute('data-theme');
            }

            // Listen for system theme changes
            window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
                if (!localStorage.getItem('family_chores_theme')) {
                    this.isDarkMode = e.matches;
                    if (e.matches) {
                        document.documentElement.setAttribute('data-theme', 'dark');
                    } else {
                        document.documentElement.removeAttribute('data-theme');
                    }
                }
            });
        },

        toggleTheme() {
            this.isDarkMode = !this.isDarkMode;
            
            if (this.isDarkMode) {
                document.documentElement.setAttribute('data-theme', 'dark');
                localStorage.setItem('family_chores_theme', 'dark');
                this.showNotification('info', 'Dark Mode', 'Dark mode enabled');
            } else {
                document.documentElement.removeAttribute('data-theme');
                localStorage.setItem('family_chores_theme', 'light');
                this.showNotification('info', 'Light Mode', 'Light mode enabled');
            }
        },

        // View chore submissions
        viewSubmissions(chore) {
            console.log('Viewing submissions for chore:', chore);
            this.showNotification('info', 'Coming Soon', 'Submission review feature will be available soon');
        },
        
        // Format recurring chore frequency
        formatFrequency(frequency, dayOfWeek, dayOfMonth) {
            switch (frequency) {
                case 'daily':
                    return 'Daily';
                case 'weekly':
                    if (dayOfWeek) {
                        return `Weekly on ${dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1)}s`;
                    }
                    return 'Weekly';
                case 'monthly':
                    if (dayOfMonth) {
                        return `Monthly on day ${dayOfMonth}`;
                    }
                    return 'Monthly';
                case 'custom':
                    return 'Custom schedule';
                default:
                    return frequency;
            }
        },
        
        // Format next due date
        formatNextDueDate(dateString) {
            if (!dateString) return 'Not scheduled';
            
            const date = new Date(dateString);
            const now = new Date();
            const tomorrow = new Date(now);
            tomorrow.setDate(tomorrow.getDate() + 1);
            
            // Check if it's today
            if (date.toDateString() === now.toDateString()) {
                return 'Today';
            }
            
            // Check if it's tomorrow
            if (date.toDateString() === tomorrow.toDateString()) {
                return 'Tomorrow';
            }
            
            // Otherwise return formatted date
            return date.toLocaleDateString();
        }
    };
}

// Service Worker Registration for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then((registration) => {
                console.log('SW registered: ', registration);
            })
            .catch((registrationError) => {
                console.log('SW registration failed: ', registrationError);
            });
    });
}

// Handle offline/online status
window.addEventListener('online', () => {
    console.log('App is online');
});

window.addEventListener('offline', () => {
    console.log('App is offline');
});
