/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Profile_CreateInputs */

const uk_profile_create = /** @type {(inputs: Profile_CreateInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Новий профіль`)
};

const en_profile_create = /** @type {(inputs: Profile_CreateInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`New profile`)
};

/**
* | output |
* | --- |
* | "New profile" |
*
* @param {Profile_CreateInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const profile_create = /** @type {((inputs?: Profile_CreateInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Profile_CreateInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_profile_create(inputs)
	return en_profile_create(inputs)
});