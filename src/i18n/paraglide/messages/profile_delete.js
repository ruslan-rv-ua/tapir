/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Profile_DeleteInputs */

const uk_profile_delete = /** @type {(inputs: Profile_DeleteInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Видалити`)
};

const en_profile_delete = /** @type {(inputs: Profile_DeleteInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Delete`)
};

/**
* | output |
* | --- |
* | "Delete" |
*
* @param {Profile_DeleteInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const profile_delete = /** @type {((inputs?: Profile_DeleteInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Profile_DeleteInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_profile_delete(inputs)
	return en_profile_delete(inputs)
});