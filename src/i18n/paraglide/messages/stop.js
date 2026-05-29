/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} StopInputs */

const uk_stop = /** @type {(inputs: StopInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Зупинити`)
};

const en_stop = /** @type {(inputs: StopInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Stop`)
};

/**
* | output |
* | --- |
* | "Stop" |
*
* @param {StopInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const stop = /** @type {((inputs?: StopInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<StopInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_stop(inputs)
	return en_stop(inputs)
});