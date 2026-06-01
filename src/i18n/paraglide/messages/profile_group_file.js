/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Profile_Group_FileInputs */

const uk_profile_group_file = /** @type {(inputs: Profile_Group_FileInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Файл`)
};

const en_profile_group_file = /** @type {(inputs: Profile_Group_FileInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`File`)
};

/**
* | output |
* | --- |
* | "File" |
*
* @param {Profile_Group_FileInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const profile_group_file = /** @type {((inputs?: Profile_Group_FileInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Profile_Group_FileInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_profile_group_file(inputs)
	return en_profile_group_file(inputs)
});