/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Profile_ImportInputs */

const uk_profile_import = /** @type {(inputs: Profile_ImportInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Імпортувати`)
};

const en_profile_import = /** @type {(inputs: Profile_ImportInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Import`)
};

/**
* | output |
* | --- |
* | "Import" |
*
* @param {Profile_ImportInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const profile_import = /** @type {((inputs?: Profile_ImportInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Profile_ImportInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_profile_import(inputs)
	return en_profile_import(inputs)
});