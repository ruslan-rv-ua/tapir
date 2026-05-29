/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Stop_Stream_PlaybackInputs */

const uk_stop_stream_playback = /** @type {(inputs: Stop_Stream_PlaybackInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Зупинити відтворення`)
};

const en_stop_stream_playback = /** @type {(inputs: Stop_Stream_PlaybackInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Stop playback`)
};

/**
* | output |
* | --- |
* | "Stop playback" |
*
* @param {Stop_Stream_PlaybackInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const stop_stream_playback = /** @type {((inputs?: Stop_Stream_PlaybackInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Stop_Stream_PlaybackInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_stop_stream_playback(inputs)
	return en_stop_stream_playback(inputs)
});