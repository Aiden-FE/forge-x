import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router, { registerAllTools } from './router'
import './styles/variables.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)

// Register all tools BEFORE installing the router: dynamic tool routes must
// exist before the router resolves the initial location on a direct page load
// (e.g. opening /#/tool/<id> in a fresh browser).
registerAllTools()

app.use(router)

app.mount('#app')
