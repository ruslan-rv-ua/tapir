/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{ name: NonNullable<unknown> }} Playback_StartedInputs */

const uk_playback_started = /** @type {(inputs: Playback_StartedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Відтворення: ${i?.name}`)
};

const en_playback_started = /** @type {(inputs: Playback_StartedInputs) => LocalizedString} */ (i) => {
	return /** @type {LocalizedString} */ (`Playing: ${i?.name}`)
};

/**
* | output |
* | --- |
* | "Playing: {name}" |
*
* @param {Playback_StartedInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const playback_started = /** @type {((inputs: Playback_StartedInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Playback_StartedInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_playback_started(inputs)
	return en_playback_started(inputs)
});