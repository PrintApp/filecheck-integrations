import { FilecheckPlugin } from '@filecheck/vue';
import { createApp } from 'vue';
import App from './App.vue';

const app = createApp(App);
app.use(FilecheckPlugin, {
  publishableKey: import.meta.env.VITE_FILECHECK_PK ?? 'pk_test123',
});
app.mount('#app');
