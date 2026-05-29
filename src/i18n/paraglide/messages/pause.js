/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} PauseInputs */

const uk_pause = /** @type {(inputs: PauseInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Призупинити`)
};

const en_pause = /** @type {(inputs: PauseInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Pause`)
};

/**
* | output |
* | --- |
* | "Pause" |
*
* @param {PauseInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const pause = /** @type {((inputs?: PauseInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<PauseInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_pause(inputs)
	return en_pause(inputs)
});