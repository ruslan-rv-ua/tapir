/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Profile_CloseInputs */

const uk_profile_close = /** @type {(inputs: Profile_CloseInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Закрити`)
};

const en_profile_close = /** @type {(inputs: Profile_CloseInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Close`)
};

/**
* | output |
* | --- |
* | "Close" |
*
* @param {Profile_CloseInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const profile_close = /** @type {((inputs?: Profile_CloseInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Profile_CloseInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_profile_close(inputs)
	return en_profile_close(inputs)
});