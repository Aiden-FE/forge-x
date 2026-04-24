import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router, { registerAllTools } from './router'
import './styles/variables.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// Register all tools after pinia is ready
registerAllTools()

app.mount('#app')
