/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Playback_PausedInputs */

const uk_playback_paused = /** @type {(inputs: Playback_PausedInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Відтворення призупинено`)
};

const en_playback_paused = /** @type {(inputs: Playback_PausedInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Playback paused`)
};

/**
* | output |
* | --- |
* | "Playback paused" |
*
* @param {Playback_PausedInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const playback_paused = /** @type {((inputs?: Playback_PausedInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Playback_PausedInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_playback_paused(inputs)
	return en_playback_paused(inputs)
});