/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Segment_PlayingInputs */

const uk_segment_playing = /** @type {(inputs: Segment_PlayingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Відтворюється`)
};

const en_segment_playing = /** @type {(inputs: Segment_PlayingInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Playing`)
};

/**
* | output |
* | --- |
* | "Playing" |
*
* @param {Segment_PlayingInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const segment_playing = /** @type {((inputs?: Segment_PlayingInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Segment_PlayingInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_segment_playing(inputs)
	return en_segment_playing(inputs)
});