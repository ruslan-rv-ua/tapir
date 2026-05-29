/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Playback_ErrorInputs */

const uk_playback_error = /** @type {(inputs: Playback_ErrorInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Помилка відтворення`)
};

const en_playback_error = /** @type {(inputs: Playback_ErrorInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Playback error`)
};

/**
* | output |
* | --- |
* | "Playback error" |
*
* @param {Playback_ErrorInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const playback_error = /** @type {((inputs?: Playback_ErrorInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Playback_ErrorInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_playback_error(inputs)
	return en_playback_error(inputs)
});