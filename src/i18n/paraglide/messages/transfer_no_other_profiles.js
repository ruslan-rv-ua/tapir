/* eslint-disable */
import { getLocale, experimentalStaticLocale } from '../runtime.js';

/** @typedef {import('../runtime.js').LocalizedString} LocalizedString */

/** @typedef {{}} Transfer_No_Other_ProfilesInputs */

const uk_transfer_no_other_profiles = /** @type {(inputs: Transfer_No_Other_ProfilesInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`Інших профілів немає`)
};

const en_transfer_no_other_profiles = /** @type {(inputs: Transfer_No_Other_ProfilesInputs) => LocalizedString} */ () => {
	return /** @type {LocalizedString} */ (`No other profiles`)
};

/**
* | output |
* | --- |
* | "No other profiles" |
*
* @param {Transfer_No_Other_ProfilesInputs} inputs
* @param {{ locale?: "uk" | "en" }} options
* @returns {LocalizedString}
*/
export const transfer_no_other_profiles = /** @type {((inputs?: Transfer_No_Other_ProfilesInputs, options?: { locale?: "uk" | "en" }) => LocalizedString) & import('../runtime.js').MessageMetadata<Transfer_No_Other_ProfilesInputs, { locale?: "uk" | "en" }, {}>} */ ((inputs = {}, options = {}) => {
	const locale = experimentalStaticLocale ?? options.locale ?? getLocale()
	if (locale === "uk") return uk_transfer_no_other_profiles(inputs)
	return en_transfer_no_other_profiles(inputs)
});