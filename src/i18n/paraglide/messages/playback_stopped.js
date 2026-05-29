/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Playback_StoppedInputs */

const uk_playback_stopped = /** @type {(inputs: Playback_StoppedInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Відтворення зупинено`)
};

const en_playback_stopped = /** @type {(inputs: Playback_StoppedInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Playback stopped`)
};

/**
* | output |
* | --- |
* | "Playback stopped" |
*
* @param {Playback_StoppedInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const playback_stopped = /** @type {((inputs?: Playback_StoppedInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Playback_StoppedInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_playback_stopped(inputs)
	return en_playback_stopped(inputs)
});