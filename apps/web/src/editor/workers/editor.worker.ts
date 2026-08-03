// Worker entry point. Monaco ships this module already written; it exists here so
// the bundler sees a worker entry inside application source, which is the only
// form Turbopack compiles into a real worker chunk.
import 'monaco-editor/editor/common/services/editorWebWorkerMain.js';
