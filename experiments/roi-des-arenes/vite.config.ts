import { defineConfig } from 'vite';

export default defineConfig({
  // Saving QA evidence must not reset a user's live movement session.
  server: { watch: { ignored: ['**/evidence/**'] } }
});
