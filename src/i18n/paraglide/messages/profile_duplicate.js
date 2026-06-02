/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Profile_DuplicateInputs */

const uk_profile_duplicate = /** @type {(inputs: Profile_DuplicateInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Дублювати`)
};

const en_profile_duplicate = /** @type {(inputs: Profile_DuplicateInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Duplicate`)
};

/**
* | output |
* | --- |
* | "Duplicate" |
*
* @param {Profile_DuplicateInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const profile_duplicate = /** @type {((inputs?: Profile_DuplicateInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Profile_DuplicateInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_profile_duplicate(inputs)
	return en_profile_duplicate(inputs)
});