import { renderAll } from './ui/layout.js';

/**
 * Entry point. The original single-file app just called `renderAll();`
 * at the very end of an inline <script> tag placed at the end of
 * <body>, so the DOM was already there by the time it ran. A module
 * script is deferred automatically (it runs after the document has
 * been parsed), so the same one-line call is all that is needed here.
 */

renderAll();
