/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Playback_ResumedInputs */

const uk_playback_resumed = /** @type {(inputs: Playback_ResumedInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Відтворення відновлено`)
};

const en_playback_resumed = /** @type {(inputs: Playback_ResumedInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Playback resumed`)
};

/**
* | output |
* | --- |
* | "Playback resumed" |
*
* @param {Playback_ResumedInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const playback_resumed = /** @type {((inputs?: Playback_ResumedInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Playback_ResumedInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_playback_resumed(inputs)
	return en_playback_resumed(inputs)
});