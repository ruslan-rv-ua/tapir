/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} OkInputs */

const uk_ok = /** @type {(inputs: OkInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Гаразд`)
};

const en_ok = /** @type {(inputs: OkInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`OK`)
};

/**
* | output |
* | --- |
* | "OK" |
*
* @param {OkInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const ok = /** @type {((inputs?: OkInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<OkInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_ok(inputs)
	return en_ok(inputs)
});