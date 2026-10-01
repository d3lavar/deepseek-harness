/** Input rejections that leave native inference untouched and keep the loaded worker reusable. */

/** A request rejected before native inference; the loaded worker remains reusable. */
export class SpeechInputError extends Error {}
